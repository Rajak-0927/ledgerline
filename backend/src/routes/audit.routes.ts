import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { verifyLedgerChain } from '../services/crypto.service.js';
import { LedgerService } from '../services/ledger.service.js';

const router = Router();

// Only ADMIN or AUDITOR roles can access the audit proof suite
router.use(authenticate, requireRole('ADMIN', 'AUDITOR'));

/**
 * GET /api/audit/verify-chain
 * Iterates through every row in the ledger and verifies cryptographic hash chaining.
 */
router.get('/verify-chain', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const result = await db.query(
            'SELECT * FROM ledger_entries ORDER BY sequence_num ASC'
        );

        const auditResult = verifyLedgerChain(result.rows);

        res.json({
            timestamp: new Date().toISOString(),
            status: auditResult.isValid ? 'PASSED_CRYPTOGRAPHICALLY_SOUND' : 'FAILED_TAMPERING_DETECTED',
            details: auditResult,
            tipHash: result.rows.length > 0 ? result.rows[result.rows.length - 1].entry_hash : null
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/audit/conservation-status
 * Mathematically verifies that sum of all balances matches net external deposits minus withdrawals.
 */
router.get('/conservation-status', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const status = await LedgerService.getSystemConservationStatus();
        res.json({
            timestamp: new Date().toISOString(),
            status: status.isBalanced ? 'BALANCED' : 'IMBALANCED_ALERT',
            metrics: status
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/audit/refused-attempts
 * Returns all rejected attempts (e.g. cross-tenant unauthorized transfers, overdraw attempts).
 */
router.get('/refused-attempts', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const result = await db.query(
            `SELECT r.*, u.full_name as initiator_name, u.email as initiator_email
             FROM refused_attempts r
             LEFT JOIN users u ON r.initiator_id = u.id
             ORDER BY r.attempted_at DESC
             LIMIT 100`
        );

        res.json({
            totalRefusedCount: result.rows.length,
            refusedAttempts: result.rows
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/audit/ledger-stream
 * Complete append-only ledger entries for external regulatory review.
 */
router.get('/ledger-stream', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const result = await db.query(
            `SELECT 
                le.*,
                t.type as transaction_type,
                t.description as transaction_description,
                u.email as initiator_email,
                a.account_number
             FROM ledger_entries le
             JOIN transactions t ON le.transaction_id = t.id
             LEFT JOIN users u ON t.initiator_id = u.id
             JOIN accounts a ON le.account_id = a.id
             ORDER BY le.sequence_num DESC
             LIMIT 200`
        );

        res.json({ entries: result.rows });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
