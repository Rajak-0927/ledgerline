import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { LedgerService } from '../services/ledger.service.js';

const router = Router();

// GET /api/accounts - List user's accounts, or all accounts if ADMIN or AUDITOR
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req.user!;
        let query = '';
        let params: any[] = [];

        if (user.role === 'ADMIN' || user.role === 'AUDITOR') {
            query = `
                SELECT a.*, u.full_name as owner_name, u.email as owner_email
                FROM accounts a
                JOIN users u ON a.user_id = u.id
                ORDER BY a.created_at ASC
            `;
        } else {
            query = `
                SELECT a.*, u.full_name as owner_name, u.email as owner_email
                FROM accounts a
                JOIN users u ON a.user_id = u.id
                WHERE a.user_id = $1
                ORDER BY a.created_at ASC
            `;
            params = [user.id];
        }

        const result = await db.query(query, params);
        res.json({ accounts: result.rows });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/accounts/:id - Get specific account details
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req.user!;
        const result = await db.query(
            `SELECT a.*, u.full_name as owner_name, u.email as owner_email
             FROM accounts a
             JOIN users u ON a.user_id = u.id
             WHERE a.id = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Account not found' });
        }

        const account = result.rows[0];

        // Access control: only owner, Admin, or Auditor
        if (user.role === 'ACCOUNT_HOLDER' && account.user_id !== user.id) {
            return res.status(403).json({ error: 'FORBIDDEN: You do not own this account' });
        }

        res.json({ account });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/accounts/:id/statement - Statement of debits, credits, running balance & refused attempts
router.get('/:id/statement', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req.user!;
        const accRes = await db.query('SELECT * FROM accounts WHERE id = $1', [req.params.id]);

        if (accRes.rows.length === 0) {
            return res.status(404).json({ error: 'Account not found' });
        }

        const account = accRes.rows[0];

        if (user.role === 'ACCOUNT_HOLDER' && account.user_id !== user.id) {
            return res.status(403).json({ error: 'FORBIDDEN: You do not own this account' });
        }

        const statement = await LedgerService.getAccountStatement(req.params.id);

        res.json({
            account: {
                id: account.id,
                accountNumber: account.account_number,
                currentBalance: Number(account.balance),
                currency: account.currency
            },
            statement
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/accounts - Create a new account (Admin or Account Holder self-opening)
const createAccountSchema = z.object({
    userId: z.string().uuid().optional(),
    accountType: z.enum(['SAVINGS', 'CHECKING']).default('SAVINGS'),
    initialBalance: z.number().min(0).default(0)
});

router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req.user!;
        const body = createAccountSchema.parse(req.body);

        let targetUserId = user.id;
        if (body.userId && user.role === 'ADMIN') {
            targetUserId = body.userId;
        }

        const accountId = crypto.randomUUID();
        const accountNumber = 'LL-' + Math.floor(1000000000 + Math.random() * 9000000000);

        const newAccountRes = await db.query(
            `INSERT INTO accounts (id, user_id, account_number, account_type, balance, currency, status, created_at)
             VALUES ($1, $2, $3, $4, 0.0000, 'INR', 'ACTIVE', NOW())
             RETURNING *`,
            [accountId, targetUserId, accountNumber, body.accountType]
        );

        // If an initial balance was provided, execute an atomic deposit
        if (body.initialBalance > 0) {
            await LedgerService.deposit({
                accountId,
                amount: body.initialBalance,
                description: 'Initial Opening Balance Deposit',
                initiatorId: user.id
            });
        }

        const finalRes = await db.query('SELECT * FROM accounts WHERE id = $1', [accountId]);
        res.status(201).json({ account: finalRes.rows[0] });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

export default router;
