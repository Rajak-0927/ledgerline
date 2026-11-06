# THREATS.md — Threat Model & Concurrency Defense Matrix

## Overview
LedgerLine is designed under a **zero-trust, adversarial money movement model**. This document identifies the specific threat vectors, race conditions, and attack strategies against money integrity and the audit trail, detailing our mitigations, proof mechanisms, and intentionally accepted risks.

---

## 1. Concurrency & Race Conditions

### Threat 1.1: Simultaneous Double-Withdrawal Race (Overdraw Attack)
* **Attack Scenario**: An account has a balance of ₹1,000. An attacker simultaneously dispatches two withdrawal requests of ₹1,000 at the exact same millisecond. If both requests read the balance (`balance >= 1000`) before either writes a deduction, both could succeed, driving the account balance to -₹1,000 (creating money or unbacked credit).
* **Mitigation**:
  1. **Strict Pessimistic Row Locking**: All money movement queries use `SELECT balance FROM accounts WHERE id = $1 FOR UPDATE`. This serializes all reads and writes for that specific account at the database row level.
  2. **Database Constraint Floor**: The `accounts` table enforces a hard constraint: `CHECK (balance >= 0)`. Even if application-level locking had a bug, the database engine will abort and roll back any transaction that results in a negative balance.
* **Status / Verification**: **Closed**. Covered by automated concurrent race test (`concurrency.test.ts`).

---

### Threat 1.2: Deadlock Under Bidirectional Concurrent Transfers (A $\leftrightarrow$ B)
* **Attack Scenario**: Account A initiates a transfer to Account B while Account B simultaneously initiates a transfer to Account A.
  * Transaction 1 locks Account A, then attempts to lock Account B.
  * Transaction 2 locks Account B, then attempts to lock Account A.
  * Result: Classic database deadlock (`40P01`), causing aborted transactions, dropped requests, or partial execution.
* **Mitigation**:
  * **Deterministic Lock Ordering**: The system sorts account IDs in ascending order prior to acquiring row locks:
    ```typescript
    const [firstId, secondId] = [fromAccountId, toAccountId].sort();
    await client.query("SELECT id FROM accounts WHERE id = ANY($1) ORDER BY id FOR UPDATE", [[firstId, secondId]]);
    ```
    Both concurrent transactions will always compete to lock the lower ID first, preventing circular wait conditions entirely.
* **Status / Verification**: **Closed**. Verified via 50-pair concurrent bidirectional transfer test.

---

## 2. Idempotency & Replay Attacks

### Threat 2.1: Replayed Transfer / Network Timeout Retry
* **Attack Scenario**: A user submits a transfer. The backend executes the transfer successfully, but the network drops before the client receives the response. The client retries the request with the same `Idempotency-Key`. Without idempotency control, the transfer would execute twice.
* **Mitigation**:
  * Persistent `idempotency_keys` table tracking:
    * `key` (unique constraint)
    * `user_id` (ensures tenant isolation)
    * `request_hash` (SHA-256 of endpoint + body)
    * `status` (`'IN_FLIGHT'` | `'COMPLETED'` | `'FAILED'`)
    * `response_code` & `response_body`
  * If a request is received with an existing key in `'COMPLETED'` status, the exact stored response is returned without executing any ledger logic.
* **Status / Verification**: **Closed**.

---

### Threat 2.2: In-Flight Duplicate Collision (Double-Click Race)
* **Attack Scenario**: A user double-clicks the transfer button, or an attacker sends two identical requests with the same idempotency key at the exact same millisecond. Both requests arrive while neither has finished.
* **Mitigation**:
  * The idempotency key record is inserted immediately inside an atomic step with `status = 'IN_FLIGHT'`.
  * If a secondary request hits the unique key constraint while the first is `'IN_FLIGHT'`, it is immediately rejected with HTTP `409 Conflict` ("Request with this idempotency key is currently processing").
* **Status / Verification**: **Closed**.

---

### Threat 2.3: Idempotency Key Hijacking (Cross-User Collision)
* **Attack Scenario**: User Malicious guesses or reuses an idempotency key used by User Victim to either inspect the victim's transfer response or block the victim's request.
* **Mitigation**:
  * Unique constraint spans `(user_id, idempotency_key)`.
  * A user can never access or collide with keys outside their authenticated session.
* **Status / Verification**: **Closed**.

---

## 3. Money Conservation & Ledger Integrity

### Threat 3.1: Lost Credit / Half-Executed Transfer
* **Attack Scenario**: A transfer debits Account A, but an unhandled exception or crash occurs before Account B is credited, destroying money.
* **Mitigation**:
  * **Strict Atomic Database Transactions**: Every money-moving operation is wrapped in a single `BEGIN ... COMMIT` block. If any step fails, the entire transaction is rolled back.
  * **Double-Entry Journal Balancing**: Every transaction creates balanced `ledger_entries` (Debit sum == Credit sum).
* **Status / Verification**: **Closed**. Verified by System Invariant Integrity check.

---

### Threat 3.2: Tampering With Historical Ledger Records
* **Attack Scenario**: A malicious insider or compromised admin account alters an existing ledger record in the database to adjust past running balances or disguise embezzlement.
* **Mitigation**:
  1. **Cryptographic Hash Chaining (SHA-256)**: Each ledger entry stores `prev_hash` and `hash = SHA256(prev_hash + entry_id + account_id + amount + type + created_at)`. If any row is modified or deleted, the hash chain breaks from that point forward.
  2. **Database Trigger Guard**: A PostgreSQL trigger blocks all `UPDATE` or `DELETE` operations on `ledger_entries`:
     ```sql
     CREATE TRIGGER no_tamper_ledger
     BEFORE UPDATE OR DELETE ON ledger_entries
     FOR EACH ROW EXECUTE FUNCTION reject_ledger_tampering();
     ```
  3. **Auditor Verification Tool**: The Auditor role can trigger an automated end-to-end cryptographic integrity audit at any time.
* **Status / Verification**: **Closed**.

---

### Threat 3.3: Lost Audit of Refused / Failed Attempts
* **Attack Scenario**: A user attempts an unauthorized withdrawal or tries to overdraw an account. The transaction aborts and rolls back, which would normally erase the record of the refused attempt.
* **Mitigation**:
  * Refused attempts are captured and committed in an **autonomous logging transaction** (`audit_logs` / `refused_attempts`) outside of the rolled-back money movement transaction.
  * The statement view displays both successful postings and refused attempts.
* **Status / Verification**: **Closed**.

---

## 4. Authorization & Privilege Escalation

### Threat 4.1: Cross-Tenant Debit (Moving Another User's Money)
* **Attack Scenario**: User 1 sends a transfer payload specifying `from_account_id = [User 2's Account]`.
* **Mitigation**:
  * Server-side authorization check: On every transfer/withdrawal request, the system queries the account ownership against `req.user.id`. If `account.user_id !== req.user.id` (and user is not a system superadmin), the request is rejected immediately with HTTP `403 Forbidden` and logged as a security alert.
* **Status / Verification**: **Closed**.

---

## 5. Consciously Accepted Risks & Architectural Boundaries

1. **Database Superuser Raw Disk Tampering**:
   * *Risk*: A database administrator with root direct disk access or `pg_catalog` bypass could hypothetically disable triggers or rewrite transaction log files.
   * *Defense / Rationale*: Mitigated by cryptographic hash chaining. Even if disk files are modified, the application hash chain will fail cryptographic verification during audit checks.
2. **Idempotency Key Retention Lifetime**:
   * *Risk*: High transaction volume could cause `idempotency_keys` table growth over months.
   * *Rationale*: Keys are retained for a rolling 24-hour window for operational safety; historical auditability is preserved permanently in `ledger_entries` and `transactions`.
