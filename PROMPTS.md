# PROMPTS.md — AI Directives, Failure Audits & Corrective Interventions

This log documents prompt-level interactions with the AI assistant during the engineering of LedgerLine. Per challenge requirements, each entry specifies what was asked, what the AI produced, what was specifically wrong or insecure about the suggestion, and the corrective action implemented with commit references.

---

### Entry 1: 2026-11-06 — Project Initialization & Architecture Strategy
* **Date**: Friday, November 6, 2026
* **Task / Prompt**:
  > *"Analyze the Snovasys hiring challenge requirements for LedgerLine. Recommend a system architecture, concurrency control pattern, and ledger representation."*
* **What the AI Produced**:
  * Recommended a standard web application with a relational database.
  * Initially suggested single-entry balance mutations (`UPDATE accounts SET balance = balance - X WHERE id = Y`), relying solely on a check constraint `balance >= 0`.
  * Suggested an application-level in-memory mutex or Redis lock for concurrency.
* **What Was Specifically Wrong / Flawed**:
  1. **Single-Entry Vulnerability**: Single-entry balance updates do not guarantee conservation. If an internal transfer subtracts from Account A and adds to Account B, single-entry lacks proof that total system money was preserved without external auditing.
  2. **In-Memory / Redis Lock Risk**: In a multi-replica or serverless deployment, in-memory mutexes fail completely across processes. Redis locks introduce dual-system failure modes (split-brain, network partitions between Redis and DB).
  3. **Deadlock Blindspot**: Did not account for bidirectional concurrent transfers ($A \rightarrow B$ and $B \rightarrow A$ simultaneously), which triggers PostgreSQL deadlocks (`40P01`) if accounts are locked in arbitrary order.
* **What Was Done Instead (Correction)**:
  * Enforced **Double-Entry Bookkeeping** with immutable `transactions` and `ledger_entries` (every transfer generates an equal Debit and Credit row).
  * Replaced distributed/in-memory locks with database-native **Pessimistic Row-Level Locking** (`SELECT ... FOR UPDATE`).
  * Implemented **Deterministic Account ID Sorting** (`ORDER BY id ASC`) before acquiring row locks, mathematically preventing deadlocks.
* **Commit**: `65ced7d`

---

### Entry 2: 2026-11-06 — Idempotency Key Handling & In-Flight Collision
* **Date**: Friday, November 6, 2026
* **Task / Prompt**:
  > *"Design the idempotency mechanism for money movement endpoints so retries return the previous result."*
* **What the AI Produced**:
  * Suggested checking if an `Idempotency-Key` exists in the database at the start of the handler:
    ```typescript
    const existing = await db.findKey(key);
    if (existing) return existing.response;
    // ... execute transfer ...
    await db.saveKey(key, response);
    ```
* **What Was Specifically Wrong / Flawed**:
  * **Classic Time-of-Check to Time-of-Use (TOCTOU) Race**: If two identical requests arrive at the exact same millisecond (e.g. double-click or network duplicate), both run `db.findKey(key)`, both see nothing, and both proceed to move money twice before either saves the key!
  * Did not handle request body tampering (a client could reuse the same key with a different amount or different destination account).
* **What Was Done Instead (Correction)**:
  * Implemented an atomic **Two-Phase Idempotency Protocol**:
    1. At request start, attempt an atomic insert into `idempotency_keys` with `status = 'IN_FLIGHT'` and a SHA-256 hash of the request payload.
    2. If a duplicate key arrives while `'IN_FLIGHT'`, reject immediately with `409 Conflict`.
    3. If the payload hash doesn't match the existing key, reject with `422 Unprocessable Entity` (Key Mismatch).
    4. Upon transaction commit, update the key's status to `'COMPLETED'` with the cached JSON response.
* **Commit**: `[Implemented in backend/src/services/idempotency.service.ts]`

---

### Entry 3: 2026-11-06 — Concurrency Defense-in-Depth & Parameterized Array Incompatibility
* **Date**: Friday, November 6, 2026
* **Task / Prompt**:
  > *"Write the transfer locking SQL query and run the automated concurrency attack test suite."*
* **What the AI Produced**:
  * The AI generated the lock acquisition query as:
    ```sql
    SELECT * FROM accounts WHERE id = ANY($1) ORDER BY id ASC FOR UPDATE
    ```
    passing `[[firstLockId, secondLockId]]` as parameter.
  * Relied exclusively on database-level `FOR UPDATE` lock hints without checking engine compatibility with in-process test runners.
* **What Was Specifically Wrong / Flawed**:
  1. **SQL Parameter Syntax Error**: The nested array syntax for `ANY($1)` failed during query evaluation, returning 0 rows and causing transfers to abort with `One or both transfer accounts do not exist`.
  2. **Mock Harness / Single-Process Concurrency Leak**: While PostgreSQL engine enforces `FOR UPDATE` on disk, in-memory test databases (used for zero-dependency local testing) ignore row-level lock hints. As a result, 10 parallel asynchronous promises in the Node.js event loop were able to read before the first write committed, causing the race test to observe 10 successes instead of 1.
* **What Was Done Instead (Correction)**:
  1. Replaced ambiguous `ANY($1)` syntax with explicit, universally compatible parameterized SQL:
     ```sql
     SELECT * FROM accounts WHERE id IN ($1, $2) ORDER BY id ASC FOR UPDATE
     ```
  2. Implemented an **AccountMutex queue (Defense-in-Depth)** at the application service layer that sequences parallel requests for the same account IDs in-process, complementing the database engine's row-level `FOR UPDATE` locks.
  3. Re-ran Vitest: All 5 test suites (7 tests) including 10 parallel overdraw attacks and 40 simultaneous cross-transfers passed with 0 errors.
* **Commit**: `[feat: complete backend core ledger engine, tests passing]`

---
