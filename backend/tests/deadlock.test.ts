import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { db } from '../src/db/index.js';
import { LedgerService } from '../src/services/ledger.service.js';

describe('DEADLOCK PREVENTION: Bidirectional Concurrent Transfers (A <-> B)', () => {
    let accountA: string;
    let accountB: string;
    let userA: string;
    let userB: string;

    beforeAll(async () => {
        userA = crypto.randomUUID();
        userB = crypto.randomUUID();

        await db.query(`INSERT INTO users (id, email, password_hash, role, full_name) VALUES ($1, 'a@test.local', 'h', 'ACCOUNT_HOLDER', 'User A')`, [userA]);
        await db.query(`INSERT INTO users (id, email, password_hash, role, full_name) VALUES ($1, 'b@test.local', 'h', 'ACCOUNT_HOLDER', 'User B')`, [userB]);

        accountA = crypto.randomUUID();
        accountB = crypto.randomUUID();

        await db.query(`INSERT INTO accounts (id, user_id, account_number, balance) VALUES ($1, $2, 'LL-DL-A', 5000)`, [accountA, userA]);
        await db.query(`INSERT INTO accounts (id, user_id, account_number, balance) VALUES ($1, $2, 'LL-DL-B', 5000)`, [accountB, userB]);
    });

    it('PROVES: 40 simultaneous cross-transfers (20 A->B and 20 B->A) execute with 0 deadlocks and conserve total money', async () => {
        const transferCount = 20;
        const transferAmount = 50;

        // Total starting pool = 5,000 + 5,000 = 10,000
        const initialTotal = 10000;

        const transfersAtoB = Array.from({ length: transferCount }).map(() =>
            LedgerService.transfer({
                fromAccountId: accountA,
                toAccountId: accountB,
                amount: transferAmount,
                initiatorId: userA
            })
        );

        const transfersBtoA = Array.from({ length: transferCount }).map(() =>
            LedgerService.transfer({
                fromAccountId: accountB,
                toAccountId: accountA,
                amount: transferAmount,
                initiatorId: userB
            })
        );

        // Run all 40 simultaneously in intermingled order
        const allTransfers = [...transfersAtoB, ...transfersBtoA].sort(() => Math.random() - 0.5);

        const results = await Promise.allSettled(allTransfers);

        // Verify no request failed due to PostgreSQL deadlock (code 40P01)
        const deadlocks = results.filter(
            r => r.status === 'rejected' && (r.reason.message.includes('deadlock') || r.reason.code === '40P01')
        );
        expect(deadlocks.length).toBe(0);

        // Verify total conservation invariant: Sum of balances after all transfers must still equal exactly 10,000
        const accARes = await db.query('SELECT balance FROM accounts WHERE id = $1', [accountA]);
        const accBRes = await db.query('SELECT balance FROM accounts WHERE id = $1', [accountB]);

        const endTotal = Number(accARes.rows[0].balance) + Number(accBRes.rows[0].balance);
        expect(endTotal).toBe(initialTotal);
    });
});
