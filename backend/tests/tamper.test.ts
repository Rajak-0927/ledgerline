import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { db } from '../src/db/index.js';
import { LedgerService } from '../src/services/ledger.service.js';
import { verifyLedgerChain } from '../src/services/crypto.service.js';

describe('CRYPTOGRAPHIC TAMPER-EVIDENT SUITE: Proof of Immutability', () => {
    let accA: string;
    let accB: string;
    let userId: string;

    beforeAll(async () => {
        userId = crypto.randomUUID();
        await db.query(`INSERT INTO users (id, email, password_hash, role, full_name) VALUES ($1, 'audit_user@test.local', 'h', 'ACCOUNT_HOLDER', 'Audit Test')`, [userId]);

        accA = crypto.randomUUID();
        accB = crypto.randomUUID();

        await db.query(`INSERT INTO accounts (id, user_id, account_number, balance) VALUES ($1, $2, 'LL-TAMPER-A', 5000)`, [accA, userId]);
        await db.query(`INSERT INTO accounts (id, user_id, account_number, balance) VALUES ($1, $2, 'LL-TAMPER-B', 1000)`, [accB, userId]);
    });

    it('PROVES: Clean sequence of transfers produces a mathematically valid SHA-256 hash chain', async () => {
        await LedgerService.transfer({ fromAccountId: accA, toAccountId: accB, amount: 200, initiatorId: userId });
        await LedgerService.transfer({ fromAccountId: accB, toAccountId: accA, amount: 50, initiatorId: userId });

        const entriesRes = await db.query('SELECT * FROM ledger_entries ORDER BY sequence_num ASC');
        expect(entriesRes.rows.length).toBeGreaterThanOrEqual(4);

        const audit = verifyLedgerChain(entriesRes.rows);
        expect(audit.isValid).toBe(true);
        expect(audit.totalVerified).toBe(entriesRes.rows.length);
    });

    it('PROVES: Any silently modified ledger row breaks cryptographic verification immediately', async () => {
        const entriesRes = await db.query('SELECT * FROM ledger_entries ORDER BY sequence_num ASC');
        const rows = [...entriesRes.rows];

        // Simulate an attacker tampering with the amount of an earlier ledger posting
        const tamperedRows = rows.map((r, idx) => {
            if (idx === 1) {
                return { ...r, amount: '99999.0000' }; // Tampered amount!
            }
            return r;
        });

        const audit = verifyLedgerChain(tamperedRows);
        expect(audit.isValid).toBe(false);
        expect(audit.brokenAtSequence).toBe(Number(tamperedRows[1].sequence_num));
        expect(audit.reason).toContain('Tampered row data');
    });
});
