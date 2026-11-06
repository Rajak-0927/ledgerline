import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { db } from '../src/db/index.js';
import { LedgerService } from '../src/services/ledger.service.js';

describe('AUTHORIZATION SUITE: Multi-Tenant Isolation & Cross-Tenant Theft Defense', () => {
    let attackerId: string;
    let victimId: string;
    let victimAccountId: string;
    let attackerAccountId: string;

    beforeAll(async () => {
        attackerId = crypto.randomUUID();
        victimId = crypto.randomUUID();

        await db.query(`INSERT INTO users (id, email, password_hash, role, full_name) VALUES ($1, 'attacker@test.local', 'h', 'ACCOUNT_HOLDER', 'Attacker')`, [attackerId]);
        await db.query(`INSERT INTO users (id, email, password_hash, role, full_name) VALUES ($1, 'victim@test.local', 'h', 'ACCOUNT_HOLDER', 'Victim')`, [victimId]);

        victimAccountId = crypto.randomUUID();
        attackerAccountId = crypto.randomUUID();

        await db.query(`INSERT INTO accounts (id, user_id, account_number, balance) VALUES ($1, $2, 'LL-VICTIM-01', 10000)`, [victimAccountId, victimId]);
        await db.query(`INSERT INTO accounts (id, user_id, account_number, balance) VALUES ($1, $2, 'LL-ATTACK-01', 100)`, [attackerAccountId, attackerId]);
    });

    it('PROVES: Attacker cannot transfer money out of Victim account and attempt is captured in audit log', async () => {
        let threwError = false;
        try {
            await LedgerService.transfer({
                fromAccountId: victimAccountId,
                toAccountId: attackerAccountId,
                amount: 5000,
                initiatorId: attackerId // Attacker attempting to authorize transfer from Victim's account
            });
        } catch (err: any) {
            threwError = true;
            expect(err.message).toContain('FORBIDDEN');
        }

        expect(threwError).toBe(true);

        // Verify Victim's money was not touched
        const victimRes = await db.query('SELECT balance FROM accounts WHERE id = $1', [victimAccountId]);
        expect(Number(victimRes.rows[0].balance)).toBe(10000);

        // Verify unauthorized attempt was recorded in the audit trail
        const auditRes = await db.query(
            "SELECT * FROM refused_attempts WHERE initiator_id = $1 AND source_account_id = $2",
            [attackerId, victimAccountId]
        );
        expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);
        expect(auditRes.rows[0].failure_reason).toContain('UNAUTHORIZED');
    });
});
