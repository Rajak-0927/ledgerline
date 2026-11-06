import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { db } from '../src/db/index.js';
import { IdempotencyService, computeRequestHash } from '../src/services/idempotency.service.js';
import { LedgerService } from '../src/services/ledger.service.js';

describe('IDEMPOTENCY SUITE: Exactly-Once Money Movement & Replay Attack Defense', () => {
    let user1Id: string;
    let account1: string;
    let account2: string;

    beforeAll(async () => {
        user1Id = crypto.randomUUID();
        await db.query(`INSERT INTO users (id, email, password_hash, role, full_name) VALUES ($1, 'idem_user@test.local', 'h', 'ACCOUNT_HOLDER', 'Idem User')`, [user1Id]);

        account1 = crypto.randomUUID();
        account2 = crypto.randomUUID();

        await db.query(`INSERT INTO accounts (id, user_id, account_number, balance) VALUES ($1, $2, 'LL-IDEM-1', 2000)`, [account1, user1Id]);
        await db.query(`INSERT INTO accounts (id, user_id, account_number, balance) VALUES ($1, $2, 'LL-IDEM-2', 500)`, [account2, user1Id]);
    });

    it('PROVES: Replayed request with same Idempotency-Key returns cached result and moves money ONLY ONCE', async () => {
        const idempotencyKey = 'idem-req-' + crypto.randomUUID();
        const endpoint = '/api/transfers';
        const payload = { fromAccountId: account1, toAccountId: account2, amount: 500 };
        const requestHash = computeRequestHash(endpoint, payload);

        // 1. First invocation: acquires lock
        const lock1 = await IdempotencyService.acquireLock(user1Id, idempotencyKey, requestHash);
        expect(lock1.action).toBe('PROCEED');

        // Execute money transfer
        const transferResult = await LedgerService.transfer({
            fromAccountId: account1,
            toAccountId: account2,
            amount: 500,
            initiatorId: user1Id
        });

        // Mark completed with response body
        await IdempotencyService.markCompleted(user1Id, idempotencyKey, 200, transferResult);

        // Balance check: account1 should have 1500, account2 should have 1000
        const acc1Res1 = await db.query('SELECT balance FROM accounts WHERE id = $1', [account1]);
        expect(Number(acc1Res1.rows[0].balance)).toBe(1500);

        // 2. Second invocation: REPLAY with identical key and payload
        const lock2 = await IdempotencyService.acquireLock(user1Id, idempotencyKey, requestHash);
        expect(lock2.action).toBe('REPLAY');
        expect(lock2.statusCode).toBe(200);
        expect(lock2.responseBody.transactionId).toBe(transferResult.transactionId);

        // PROOF: Money must NOT have moved again!
        const acc1Res2 = await db.query('SELECT balance FROM accounts WHERE id = $1', [account1]);
        const acc2Res2 = await db.query('SELECT balance FROM accounts WHERE id = $1', [account2]);

        expect(Number(acc1Res2.rows[0].balance)).toBe(1500); // Unchanged!
        expect(Number(acc2Res2.rows[0].balance)).toBe(1000); // Unchanged!
    });

    it('PROVES: Key reuse with modified payload fails with PAYLOAD_MISMATCH', async () => {
        const key = 'idem-tamper-' + crypto.randomUUID();
        const initialHash = computeRequestHash('/api/transfers', { amount: 100 });
        const modifiedHash = computeRequestHash('/api/transfers', { amount: 999 });

        await IdempotencyService.acquireLock(user1Id, key, initialHash);

        const check = await IdempotencyService.acquireLock(user1Id, key, modifiedHash);
        expect(check.action).toBe('PAYLOAD_MISMATCH');
    });
});
