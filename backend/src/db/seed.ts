import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './index.js';
import { LedgerService } from '../services/ledger.service.js';

export async function runSeed() {
    console.log('[SEED] Starting seed process for LedgerLine...');

    const passwordHash = await bcrypt.hash('Password@123', 10);

    // 1. Seed Admin
    const adminId = crypto.randomUUID();
    await db.query(
        `INSERT INTO users (id, email, password_hash, role, full_name, created_at)
         VALUES ($1, 'admin@ledgerline.local', $2, 'ADMIN', 'System Administrator', NOW())
         ON CONFLICT (email) DO NOTHING`,
        [adminId, passwordHash]
    );

    // 2. Seed Auditor
    const auditorId = crypto.randomUUID();
    await db.query(
        `INSERT INTO users (id, email, password_hash, role, full_name, created_at)
         VALUES ($1, 'auditor@ledgerline.local', $2, 'AUDITOR', 'Independent Lead Auditor', NOW())
         ON CONFLICT (email) DO NOTHING`,
        [auditorId, passwordHash]
    );

    // 3. Seed Account Holder 1 (Alice)
    const aliceId = crypto.randomUUID();
    const aliceUserRes = await db.query(
        `INSERT INTO users (id, email, password_hash, role, full_name, created_at)
         VALUES ($1, 'alice@ledgerline.local', $2, 'ACCOUNT_HOLDER', 'Alice Johnson', NOW())
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING id`,
        [aliceId, passwordHash]
    );
    const resolvedAliceId = aliceUserRes.rows[0]?.id || aliceId;

    // Check if Alice has an account
    const aliceAccRes = await db.query('SELECT * FROM accounts WHERE user_id = $1', [resolvedAliceId]);
    let aliceAccountId: string;
    if (aliceAccRes.rows.length === 0) {
        aliceAccountId = crypto.randomUUID();
        await db.query(
            `INSERT INTO accounts (id, user_id, account_number, account_type, balance, currency, status, created_at)
             VALUES ($1, $2, 'LL-1000000001', 'SAVINGS', 0, 'INR', 'ACTIVE', NOW())`,
            [aliceAccountId, resolvedAliceId]
        );
        // Deposit initial balance
        await LedgerService.deposit({
            accountId: aliceAccountId,
            amount: 5000,
            description: 'Seed Capital Deposit for Alice',
            initiatorId: resolvedAliceId
        });
    } else {
        aliceAccountId = aliceAccRes.rows[0].id;
    }

    // 4. Seed Account Holder 2 (Bob)
    const bobId = crypto.randomUUID();
    const bobUserRes = await db.query(
        `INSERT INTO users (id, email, password_hash, role, full_name, created_at)
         VALUES ($1, 'bob@ledgerline.local', $2, 'ACCOUNT_HOLDER', 'Bob Smith', NOW())
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING id`,
        [bobId, passwordHash]
    );
    const resolvedBobId = bobUserRes.rows[0]?.id || bobId;

    const bobAccRes = await db.query('SELECT * FROM accounts WHERE user_id = $1', [resolvedBobId]);
    let bobAccountId: string;
    if (bobAccRes.rows.length === 0) {
        bobAccountId = crypto.randomUUID();
        await db.query(
            `INSERT INTO accounts (id, user_id, account_number, account_type, balance, currency, status, created_at)
             VALUES ($1, $2, 'LL-1000000002', 'SAVINGS', 0, 'INR', 'ACTIVE', NOW())`,
            [bobAccountId, resolvedBobId]
        );
        // Deposit initial balance
        await LedgerService.deposit({
            accountId: bobAccountId,
            amount: 2500,
            description: 'Seed Capital Deposit for Bob',
            initiatorId: resolvedBobId
        });
    } else {
        bobAccountId = bobAccRes.rows[0].id;
    }

    console.log('[SEED] Seeding successfully completed!');
    console.log('[SEED] Demo Accounts:');
    console.log(' - Admin: admin@ledgerline.local / Password@123');
    console.log(' - Auditor: auditor@ledgerline.local / Password@123');
    console.log(` - Alice (₹5,000): alice@ledgerline.local / Password@123 [Acc: LL-1000000001, ID: ${aliceAccountId}]`);
    console.log(` - Bob (₹2,500): bob@ledgerline.local / Password@123 [Acc: LL-1000000002, ID: ${bobAccountId}]`);
}

// Auto-run if executed directly
if (process.argv[1]?.includes('seed.ts')) {
    runSeed().catch(err => {
        console.error('[SEED_ERROR]', err);
        process.exit(1);
    });
}
