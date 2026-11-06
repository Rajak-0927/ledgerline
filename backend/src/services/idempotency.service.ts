import crypto from 'crypto';
import { db } from '../db/index.js';

export function computeRequestHash(endpoint: string, body: any): string {
    const serialized = JSON.stringify({ endpoint, body: body || {} });
    return crypto.createHash('sha256').update(serialized).digest('hex');
}

export class IdempotencyService {
    /**
     * Atomically locks or checks an idempotency key.
     * Returns either:
     * - 'PROCEED' (new key locked in IN_FLIGHT status)
     * - 'REPLAY' (previously completed, returns stored response)
     * - 'CONFLICT_IN_FLIGHT' (concurrent request with same key currently in progress)
     * - 'PAYLOAD_MISMATCH' (key reused with different parameters)
     */
    static async acquireLock(userId: string, key: string, requestHash: string): Promise<{
        action: 'PROCEED' | 'REPLAY' | 'CONFLICT_IN_FLIGHT' | 'PAYLOAD_MISMATCH';
        statusCode?: number;
        responseBody?: any;
    }> {
        // First check if key already exists
        const checkRes = await db.query(
            'SELECT * FROM idempotency_keys WHERE user_id = $1 AND key = $2',
            [userId, key]
        );

        if (checkRes.rows.length > 0) {
            const existing = checkRes.rows[0];

            // 1. Verify payload hash match
            if (existing.request_hash !== requestHash) {
                return { action: 'PAYLOAD_MISMATCH' };
            }

            // 2. Check status
            if (existing.status === 'IN_FLIGHT') {
                return { action: 'CONFLICT_IN_FLIGHT' };
            }

            if (existing.status === 'COMPLETED') {
                return {
                    action: 'REPLAY',
                    statusCode: existing.response_code,
                    responseBody: existing.response_body
                };
            }

            // If previously FAILED, allow re-attempt by resetting status to IN_FLIGHT
            await db.query(
                `UPDATE idempotency_keys 
                 SET status = 'IN_FLIGHT', updated_at = NOW() 
                 WHERE user_id = $1 AND key = $2`,
                [userId, key]
            );
            return { action: 'PROCEED' };
        }

        // Key doesn't exist yet: insert atomically with status = 'IN_FLIGHT'
        try {
            await db.query(
                `INSERT INTO idempotency_keys (key, user_id, request_hash, status, created_at, updated_at)
                 VALUES ($1, $2, $3, 'IN_FLIGHT', NOW(), NOW())`,
                [key, userId, requestHash]
            );
            return { action: 'PROCEED' };
        } catch (err: any) {
            // Concurrent race on insertion (hit primary key constraint)
            return { action: 'CONFLICT_IN_FLIGHT' };
        }
    }

    /**
     * Marks the idempotency key as COMPLETED with the final response.
     */
    static async markCompleted(userId: string, key: string, statusCode: number, responseBody: any) {
        await db.query(
            `UPDATE idempotency_keys 
             SET status = 'COMPLETED', response_code = $1, response_body = $2, updated_at = NOW()
             WHERE user_id = $3 AND key = $4`,
            [statusCode, JSON.stringify(responseBody), userId, key]
        );
    }

    /**
     * Marks the idempotency key as FAILED if an error occurred.
     */
    static async markFailed(userId: string, key: string) {
        await db.query(
            `UPDATE idempotency_keys 
             SET status = 'FAILED', updated_at = NOW()
             WHERE user_id = $1 AND key = $2`,
            [userId, key]
        );
    }
}
