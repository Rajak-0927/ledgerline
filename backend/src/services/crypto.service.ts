import crypto from 'crypto';

export const GENESIS_HASH = '0'.repeat(64);

export interface LedgerEntryPayload {
    id: string;
    transaction_id: string;
    account_id: string;
    entry_type: 'DEBIT' | 'CREDIT';
    amount: string | number;
    running_balance: string | number;
    created_at: string | Date;
}

/**
 * Calculates SHA-256 cryptographic hash for a ledger posting chained to prev_hash.
 */
export function calculateEntryHash(prevHash: string, entry: LedgerEntryPayload): string {
    const canonicalPayload = [
        prevHash,
        entry.id,
        entry.transaction_id,
        entry.account_id,
        entry.entry_type,
        Number(entry.amount).toFixed(4),
        Number(entry.running_balance).toFixed(4),
        new Date(entry.created_at).toISOString()
    ].join('|');

    return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
}

/**
 * Verifies the mathematical integrity of a sequence of ledger postings.
 */
export function verifyLedgerChain(entries: any[]): {
    isValid: boolean;
    totalVerified: number;
    brokenAtSequence?: number;
    brokenEntryId?: string;
    reason?: string;
} {
    if (entries.length === 0) {
        return { isValid: true, totalVerified: 0 };
    }

    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        // 1. Check parent linkage
        if (entry.prev_hash !== expectedPrevHash) {
            return {
                isValid: false,
                totalVerified: i,
                brokenAtSequence: Number(entry.sequence_num),
                brokenEntryId: entry.id,
                reason: `Broken chain link: entry expects prev_hash ${entry.prev_hash}, but preceding hash was ${expectedPrevHash}`
            };
        }

        // 2. Recompute hash
        const computedHash = calculateEntryHash(entry.prev_hash, {
            id: entry.id,
            transaction_id: entry.transaction_id,
            account_id: entry.account_id,
            entry_type: entry.entry_type,
            amount: entry.amount,
            running_balance: entry.running_balance,
            created_at: entry.created_at
        });

        if (computedHash !== entry.entry_hash) {
            return {
                isValid: false,
                totalVerified: i,
                brokenAtSequence: Number(entry.sequence_num),
                brokenEntryId: entry.id,
                reason: `Tampered row data: stored entry_hash ${entry.entry_hash} does not match recomputed hash ${computedHash}`
            };
        }

        expectedPrevHash = entry.entry_hash;
    }

    return {
        isValid: true,
        totalVerified: entries.length
    };
}
