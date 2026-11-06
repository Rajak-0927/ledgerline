# LedgerLine — Provable Double-Entry Money Movement Engine

> **"Move money so the books always balance and the same request never pays twice."**  
> *Snovasys Hiring Challenge 2026 Submission*  
> **Author**: Shaik Abdul Rajak (`rajak8977407566`)

---

## 1. Quick Start from a Clean Clone (Zero External Setup Required)

LedgerLine runs out-of-the-box on any machine. For evaluation convenience, the engine includes a dual-engine database layer: an embedded PostgreSQL engine for immediate zero-dependency testing, and a production PostgreSQL driver for cloud deployment (e.g. Neon/Supabase).

### Installation & Run
```bash
# 1. Clone repository
git clone https://github.com/<your-username>/ledgerline.git
cd ledgerline

# 2. Install dependencies
npm run install:all

# 3. Run Automated Concurrency & Integrity Test Suite
npm test

# 4. Build both frontend and backend
npm run build

# 5. Start unified production server (serves frontend + API on port 4000)
npm start
```
Open **`http://localhost:4000`** in your browser.

---

## 2. Seed Accounts & Evaluation Credentials

The application is pre-seeded with test accounts covering all three mandatory roles:

| Role | Email | Password | Account Number | Initial Balance | Purpose / Permissions |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Account Holder** | `alice@ledgerline.local` | `Password@123` | `LL-1000000001` | **₹5,000.00** | Primary account holder; deposits, withdrawals, transfers. |
| **Account Holder** | `bob@ledgerline.local` | `Password@123` | `LL-1000000002` | **₹2,500.00** | Secondary account holder; transfer destination / recipient. |
| **System Admin** | `admin@ledgerline.local` | `Password@123` | *N/A* | *Superuser* | Global account provisioning, system overview, balance supervision. |
| **Lead Auditor** | `auditor@ledgerline.local` | `Password@123` | *N/A* | *Read-Only* | Cryptographic SHA-256 chain verification, conservation invariant proof ($\Delta = 0$), security refusal log. |

> **Evaluator Convenience**: The top navigation bar includes a **"Quick Switch"** dropdown to switch between Alice, Bob, Admin, and Auditor in one click without retyping credentials.

---

## 3. Core Architectural Decisions & Integrity Model

### A. Strict Double-Entry Bookkeeping
Money is never created or destroyed.
* Every transfer atomically produces a parent `transaction` and two balanced `ledger_entries`:
  * **DEBIT** on the sender account: $\text{Balance}_{\text{new}} = \text{Balance}_{\text{old}} - X$
  * **CREDIT** on the recipient account: $\text{Balance}_{\text{new}} = \text{Balance}_{\text{old}} + X$
* External deposits and withdrawals adjust individual accounts while tracking net system inflows and outflows.
* **Conservation Invariant**:
  $$\sum \text{Account Balances} \equiv \sum \text{External Deposits} - \sum \text{External Withdrawals}$$
  Verified on-demand with zero discrepancy ($\Delta = \text{₹0.0000}$).

### B. Concurrency & Deadlock Defense-in-Depth
When multiple requests race, or bidirectional transfers occur simultaneously ($A \rightarrow B$ and $B \rightarrow A$):
1. **Pessimistic Row-Level Database Locks**: Queries use `SELECT * FROM accounts WHERE id IN ($1, $2) ORDER BY id ASC FOR UPDATE`.
2. **Deterministic Lock Ordering**: Account IDs are always sorted in ascending order before locking. Both concurrent transactions compete to lock the lower ID first, mathematically eliminating circular wait deadlocks (`40P01`).
3. **AccountMutex (Application-Level Queue)**: In-process serialization per account ensures that promises racing within Node.js event loops never execute non-atomic balance reads before previous writes commit.
4. **Database Balance Floor**: A hard PostgreSQL constraint `CHECK (balance >= 0)` guarantees that no account can ever drop below zero.

### C. Exactly-Once Idempotency Protocol
Every money-moving request (`POST /api/transfers`, `/deposits`, `/withdrawals`) requires an `Idempotency-Key` header:
1. **Phase 1 (Locking)**: Key is atomically inserted into `idempotency_keys` with `status = 'IN_FLIGHT'` and a SHA-256 hash of the request payload.
2. **In-Flight Collision**: If a concurrent duplicate request arrives before the first finishes, it is rejected immediately with HTTP `409 Conflict`.
3. **Replay Detection**: If a key has already `COMPLETED`, the server returns the cached response with `X-Idempotent-Replay: true`. The ledger does **not** move money a second time.
4. **Payload Mismatch**: Reusing the same key with altered parameters returns HTTP `422 Unprocessable Entity`.

### D. Append-Only Cryptographic Hash Chain
* Every ledger posting is chained to its predecessor using SHA-256:
  $$\text{Hash}_n = \text{SHA256}(\text{Hash}_{n-1} \parallel \text{id} \parallel \text{txId} \parallel \text{accId} \parallel \text{type} \parallel \text{amount} \parallel \text{balance} \parallel \text{timestamp})$$
* **Genesis Hash**: `0000000000000000000000000000000000000000000000000000000000000000`.
* A database trigger prohibits `UPDATE` or `DELETE` on `ledger_entries`.
* The Auditor can click **"Run Cryptographic Chain Audit"** to recompute and verify all row hashes from genesis to tip.

### E. Autonomous Logging of Refused Attempts
When an overdraft or unauthorized transfer is rejected, rolling back the financial transaction would normally discard the audit trail. LedgerLine executes refused attempt logging in an **autonomous transaction** (`refused_attempts`), preserving the refusal reason and initiator for the account statement and auditor security log.

---

## 4. Automated Concurrency & Attack Test Suite

The test suite directly executes the adversarial attacks described in the challenge specification:

```bash
npm test
```

### Verified Test Cases:
1. **Parallel Race / Overdraw Attack (`concurrency.test.ts`)**:
   * Fires 10 simultaneous parallel withdrawal requests of ₹600 against an account with ₹1,000.
   * **Result**: Exactly 1 succeeds, 9 fail with `INSUFFICIENT_FUNDS`. Account balance stays ₹400 (never negative), and all 9 refused attempts are logged.
2. **Bidirectional Deadlock Stress Test (`deadlock.test.ts`)**:
   * Fires 40 simultaneous cross-transfers (20 $A \rightarrow B$ and 20 $B \rightarrow A$) in parallel.
   * **Result**: Zero deadlocks (`40P01`), 100% completed, and system conservation holds.
3. **Replay & Idempotency Attack (`idempotency.test.ts`)**:
   * Replays transfer requests with identical and tampered keys.
   * **Result**: Money moves once; second request returns identical cached payload.
4. **Cross-Tenant Theft Attack (`authorization.test.ts`)**:
   * User Attacker attempts to initiate a transfer out of User Victim's account.
   * **Result**: Blocked with HTTP 403 Forbidden and logged as a security alert.
5. **Ledger Tampering Detection (`tamper.test.ts`)**:
   * Simulates an attacker modifying an amount in a past ledger row.
   * **Result**: The Auditor verification engine detects the broken hash chain and pinpoints the corrupted row sequence.

---

## 5. API Documentation

| Endpoint | Method | Allowed Roles | Idempotency Required | Description & Impact on Money |
| :--- | :--- | :--- | :--- | :--- |
| `/api/auth/login` | `POST` | Public | No | Issues JWT Bearer token containing user ID and role. |
| `/api/accounts` | `GET` | All (Filtered) | No | Lists user's accounts; Admins/Auditors see all accounts. |
| `/api/accounts/:id/statement` | `GET` | Owner, Admin, Auditor | No | Complete statement: Debits, Credits, running balance & Refused attempts. |
| `/api/accounts` | `POST` | `ADMIN` | No | Provisions a new account with optional initial opening deposit. |
| `/api/transfers` | `POST` | `ACCOUNT_HOLDER`, `ADMIN` | **Yes** | Atomically moves money between two accounts. Creates DEBIT and CREDIT ledger entries. |
| `/api/deposits` | `POST` | `ACCOUNT_HOLDER`, `ADMIN` | **Yes** | Injects external capital into an account. Creates CREDIT ledger posting. |
| `/api/withdrawals` | `POST` | `ACCOUNT_HOLDER`, `ADMIN` | **Yes** | Deducts funds externally. Enforces balance floor. Creates DEBIT posting. |
| `/api/audit/verify-chain` | `GET` | `AUDITOR`, `ADMIN` | No | Recomputes SHA-256 hash chain across all ledger entries to detect tampering. |
| `/api/audit/conservation-status`| `GET` | `AUDITOR`, `ADMIN` | No | Verifies $\sum \text{Balances} == \sum \text{Deposits} - \sum \text{Withdrawals}$. |
| `/api/audit/refused-attempts` | `GET` | `AUDITOR`, `ADMIN` | No | Security log of all refused operations and attack attempts. |

---

## 6. What We Built vs. Deliberately Left Out

### What We Built:
* Full double-entry financial ledger with append-only guarantees.
* Cryptographic hash chain verification from genesis block to chain tip.
* Two-phase atomic idempotency locking with request-body SHA-256 fingerprinting.
* Deterministic sorted lock acquisition eliminating concurrent transfer deadlocks.
* Autonomous audit persistence for refused/failed transactions.
* Responsive, high-contrast dashboard with instant role-switching for evaluators.

### Deliberately Left Out & Why:
1. **Automatic Balance Inferences / Dynamic Recalculation on Every Read**:
   * *Why*: Scanning the entire history of millions of ledger rows on every read introduces $O(N)$ query latency. We maintain a cached `balance` on the `accounts` row updated under pessimistic lock, and verify it periodically against the ledger stream.
2. **Floating-Point Number Types (`REAL` / `FLOAT`)**:
   * *Why*: Floating-point representations introduce precision drift (e.g. `0.1 + 0.2 = 0.30000000000000004`). LedgerLine uses PostgreSQL `NUMERIC(18, 4)` and fixed-precision decimals everywhere.
3. **Client-Side Enforced Balance Checks**:
   * *Why*: Client-side checks provide zero security. All authorizations, balance floors, and permissions are exclusively enforced on the backend server.

---

## 7. Submission Artifacts Links
* **Threat Model & Concurrency Defense Matrix**: [`THREATS.md`](./THREATS.md)
* **AI Directives, Failures & Corrective Interventions Log**: [`PROMPTS.md`](./PROMPTS.md)
