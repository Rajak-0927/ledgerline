import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { enforceIdempotency } from '../middleware/idempotency.middleware.js';
import { LedgerService } from '../services/ledger.service.js';

const router = Router();

// Validation Schemas
const transferSchema = z.object({
    fromAccountId: z.string().uuid(),
    toAccountId: z.string().uuid(),
    amount: z.number().positive(),
    description: z.string().optional()
});

const depositSchema = z.object({
    accountId: z.string().uuid(),
    amount: z.number().positive(),
    description: z.string().optional()
});

const withdrawalSchema = z.object({
    accountId: z.string().uuid(),
    amount: z.number().positive(),
    description: z.string().optional()
});

/**
 * POST /api/transfers
 * Atomically moves money between two accounts with double-entry ledger postings,
 * sorted lock acquisition (deadlock prevention), and idempotency enforcement.
 */
router.post(
    '/transfers',
    authenticate,
    enforceIdempotency,
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const user = req.user!;
            const body = transferSchema.parse(req.body);

            const result = await LedgerService.transfer({
                fromAccountId: body.fromAccountId,
                toAccountId: body.toAccountId,
                amount: body.amount,
                description: body.description,
                initiatorId: user.id,
                isAdminOverride: user.role === 'ADMIN'
            });

            res.status(200).json({
                message: 'Transfer completed successfully',
                data: result
            });
        } catch (err: any) {
            const isForbidden = err.message.includes('FORBIDDEN');
            const isInsufficient = err.message.includes('Insufficient funds');
            const statusCode = isForbidden ? 403 : isInsufficient ? 400 : 400;

            res.status(statusCode).json({
                error: err.message
            });
        }
    }
);

/**
 * POST /api/deposits
 * Injects external money into an account.
 */
router.post(
    '/deposits',
    authenticate,
    enforceIdempotency,
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const user = req.user!;
            const body = depositSchema.parse(req.body);

            const result = await LedgerService.deposit({
                accountId: body.accountId,
                amount: body.amount,
                description: body.description,
                initiatorId: user.id
            });

            res.status(200).json({
                message: 'Deposit completed successfully',
                data: result
            });
        } catch (err: any) {
            res.status(400).json({ error: err.message });
        }
    }
);

/**
 * POST /api/withdrawals
 * Withdraws funds externally with atomic floor checking and refusal logging.
 */
router.post(
    '/withdrawals',
    authenticate,
    enforceIdempotency,
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const user = req.user!;
            const body = withdrawalSchema.parse(req.body);

            const result = await LedgerService.withdraw({
                accountId: body.accountId,
                amount: body.amount,
                description: body.description,
                initiatorId: user.id,
                isAdminOverride: user.role === 'ADMIN'
            });

            res.status(200).json({
                message: 'Withdrawal completed successfully',
                data: result
            });
        } catch (err: any) {
            const isForbidden = err.message.includes('FORBIDDEN');
            const statusCode = isForbidden ? 403 : 400;
            res.status(statusCode).json({ error: err.message });
        }
    }
);

export default router;
