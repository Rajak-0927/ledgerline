import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware.js';
import { IdempotencyService, computeRequestHash } from '../services/idempotency.service.js';

export function enforceIdempotency(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const key = req.headers['idempotency-key'] as string;

    if (!key) {
        return res.status(400).json({
            error: 'BAD_REQUEST: Money-moving endpoints require an Idempotency-Key header'
        });
    }

    if (!req.user) {
        return res.status(401).json({ error: 'UNAUTHORIZED: User session required for idempotency tracking' });
    }

    const userId = req.user.id;
    const requestHash = computeRequestHash(req.originalUrl, req.body);

    IdempotencyService.acquireLock(userId, key, requestHash)
        .then(result => {
            if (result.action === 'REPLAY') {
                res.setHeader('X-Idempotent-Replay', 'true');
                return res.status(result.statusCode || 200).json(result.responseBody);
            }

            if (result.action === 'CONFLICT_IN_FLIGHT') {
                return res.status(409).json({
                    error: 'CONFLICT: A request with this Idempotency-Key is currently in progress. Please retry shortly.'
                });
            }

            if (result.action === 'PAYLOAD_MISMATCH') {
                return res.status(422).json({
                    error: 'UNPROCESSABLE_ENTITY: Idempotency-Key was previously used with a different request payload or endpoint.'
                });
            }

            // Hook into response completion to record final status and payload
            const originalJson = res.json.bind(res);
            res.json = (body: any) => {
                const statusCode = res.statusCode;
                if (statusCode >= 200 && statusCode < 300) {
                    IdempotencyService.markCompleted(userId, key, statusCode, body).catch(e =>
                        console.error('[IDEMPOTENCY] Failed to mark completed:', e)
                    );
                } else {
                    IdempotencyService.markFailed(userId, key).catch(e =>
                        console.error('[IDEMPOTENCY] Failed to mark failed:', e)
                    );
                }
                return originalJson(body);
            };

            next();
        })
        .catch(err => {
            console.error('[IDEMPOTENCY_MIDDLEWARE_ERROR]', err);
            return res.status(500).json({ error: 'Internal error checking request idempotency' });
        });
}
