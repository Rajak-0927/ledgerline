import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { db } from '../src/db/index.js';
import { LedgerService } from '../src/services/ledger.service.js';
import { runSeed } from '../src/db/seed.js';

describe('CONCURRENCY DEFENSE: Simultaneous Race & Overdraw Attack Suite', () => {
    let testAccountId: string;
    let userId: string;

    beforeAll(async () => {
        await runSeed();

        // Create an isolated test account with initial balance of exactly ₹1,000
        userId = crypto.randomUUID();
        await db.query(
            `INSERT INTO users (id, email, password_hash, role, full_name)
             VALUES ($1, 'race_victim@test.local', 'hash', 'ACCOUNT_HOLDER', 'Race Victim')`,
            [userId]
        );

        testAccountId = crypto.randomUUID();
        await db.query(
            `INSERT INTO accounts (id, user_id, account_number, account_type, balance, currency, status)
             VALUES ($1, $2, 'LL-RACE-001', 'SAVINGS', 0, 'INR', 'ACTIVE')`,
            [testAccountId, userId]
        );

        // Deposit exactly ₹1,000
        await LedgerService.deposit({
            accountId: testAccountId,
            amount: 1000,
            description: 'Concurrency Test Baseline Deposit',
            initiatorId: userId
        });
    });

    it('PROVES: 10 concurrent racing withdrawals of ₹600 on a ₹1,000 balance allow only 1 success and prevent negative balance', async () => {
        const initialRes = await db.query('SELECT balance FROM accounts WHERE id = $1', [testAccountId]);
        expect(Number(initialRes.rows[0].balance)).toBe(1000);

        // Dispatch 10 parallel withdrawals of ₹600 each simultaneously
        const concurrentAttempts = 10;
        const withdrawalAmount = 600;

        const promises = Array.from({ length: concurrentAttempts }).map(async (_, idx) => {
            try {
                const res = await LedgerService.withdraw({
                    accountId: testAccountId,
                    amount: withdrawalAmount,
                    description: `Concurrent Racing Withdrawal #${idx + 1}`,
                    initiatorId: userId
                });
                return { success: true, data: res };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        const results = await Promise.all(promises);

        const successes = results.filter(r => r.success);
        const failures = results.filter(r => !r.success);

        // Mathematical Proof: ₹1,000 / ₹600 = exactly 1 possible withdrawal
        expect(successes.length).toBe(1);
        expect(failures.length).toBe(9);

        // Verify remaining balance in DB is exactly ₹400 (NEVER below zero)
        const finalAccRes = await db.query('SELECT balance FROM accounts WHERE id = $1', [testAccountId]);
        const finalBalance = Number(finalAccRes.rows[0].balance);
        expect(finalBalance).toBe(400);

        // Verify all 9 refused attempts were preserved in the audit log
        const refusedRes = await db.query(
            "SELECT * FROM refused_attempts WHERE source_account_id = $1 AND attempt_type = 'WITHDRAWAL'",
            [testAccountId]
        );
        expect(refusedRes.rows.length).toBe(9);
        expect(refusedRes.rows[0].failure_reason).toContain('INSUFFICIENT_FUNDS');
    });
});
