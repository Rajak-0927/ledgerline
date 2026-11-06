import crypto from 'crypto';
import { db, IDbClient } from '../db/index.js';
import { calculateEntryHash, GENESIS_HASH } from './crypto.service.js';

export interface TransferParams {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    description?: string;
    initiatorId: string;
    isAdminOverride?: boolean;
}

export interface DepositParams {
    accountId: string;
    amount: number;
    description?: string;
    initiatorId: string;
}

export interface WithdrawalParams {
    accountId: string;
    amount: number;
    description?: string;
    initiatorId: string;
    isAdminOverride?: boolean;
}

// In-process Account Serialization Queue (Defense-in-Depth alongside Postgres FOR UPDATE)
class AccountMutex {
    private static locks = new Map<string, Promise<void>>();

    static async lock<T>(accountIds: string[], fn: () => Promise<T>): Promise<T> {
        const sortedIds = [...accountIds].sort();
        
        // Wait for any existing locks on these accounts
        while (sortedIds.some(id => this.locks.has(id))) {
            const currentLocks = sortedIds.map(id => this.locks.get(id)).filter(Boolean) as Promise<void>[];
            if (currentLocks.length > 0) {
                await Promise.all(currentLocks);
            }
        }

        let release: () => void = () => {};
        const lockPromise = new Promise<void>(resolve => {
            release = resolve;
        });

        // Acquire lock
        for (const id of sortedIds) {
            this.locks.set(id, lockPromise);
        }

        try {
            return await fn();
        } finally {
            for (const id of sortedIds) {
                if (this.locks.get(id) === lockPromise) {
                    this.locks.delete(id);
                }
            }
            release();
        }
    }
}

/**
 * Autonomous logger for refused money movements.
 * Executed independently so rolling back the financial transaction preserves the refusal evidence.
 */
export async function logRefusedAttempt(params: {
    initiatorId: string;
    sourceAccountId?: string;
    destinationAccountId?: string;
    attemptType: string;
    amount: number;
    failureReason: string;
}) {
    try {
        await db.query(
            `INSERT INTO refused_attempts 
            (id, initiator_id, source_account_id, destination_account_id, attempt_type, amount, failure_reason, attempted_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [
                crypto.randomUUID(),
                params.initiatorId,
                params.sourceAccountId || null,
                params.destinationAccountId || null,
                params.attemptType,
                params.amount,
                params.failureReason
            ]
        );
    } catch (err: any) {
        console.error('[AUDIT_LOG_ERROR] Failed to persist refused attempt:', err.message);
    }
}

/**
 * Gets the latest ledger hash to maintain the cryptographic hash chain.
 */
async function getLatestHash(client: IDbClient): Promise<string> {
    const res = await client.query(
        'SELECT entry_hash FROM ledger_entries ORDER BY sequence_num DESC LIMIT 1'
    );
    return res.rows.length > 0 ? res.rows[0].entry_hash : GENESIS_HASH;
}

/**
 * Appends a double-entry ledger posting with SHA-256 cryptographic chaining.
 */
async function appendLedgerEntry(
    client: IDbClient,
    entry: {
        transactionId: string;
        accountId: string;
        entryType: 'DEBIT' | 'CREDIT';
        amount: number;
        runningBalance: number;
    }
) {
    const id = crypto.randomUUID();
    const prevHash = await getLatestHash(client);
    const createdAt = new Date();

    const entryHash = calculateEntryHash(prevHash, {
        id,
        transaction_id: entry.transactionId,
        account_id: entry.accountId,
        entry_type: entry.entryType,
        amount: entry.amount,
        running_balance: entry.runningBalance,
        created_at: createdAt
    });

    const result = await client.query(
        `INSERT INTO ledger_entries 
        (id, transaction_id, account_id, entry_type, amount, running_balance, prev_hash, entry_hash, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
            id,
            entry.transactionId,
            entry.accountId,
            entry.entryType,
            entry.amount,
            entry.runningBalance,
            prevHash,
            entryHash,
            createdAt
        ]
    );

    return result.rows[0];
}

export class LedgerService {
    /**
     * Executes external deposit into an account.
     */
    static async deposit(params: DepositParams) {
        if (params.amount <= 0) {
            throw new Error('Deposit amount must be strictly greater than 0');
        }

        return AccountMutex.lock([params.accountId], async () => {
            const client = await db.connect();
            try {
                await client.query('BEGIN');

                // 1. Pessimistic row-level lock on the account
                const accRes = await client.query(
                    'SELECT * FROM accounts WHERE id = $1 FOR UPDATE',
                    [params.accountId]
                );

                if (accRes.rows.length === 0) {
                    throw new Error(`Account not found: ${params.accountId}`);
                }

                const account = accRes.rows[0];
                const currentBalance = Number(account.balance);
                const newBalance = Number((currentBalance + params.amount).toFixed(4));

                // 2. Create transaction record
                const txId = crypto.randomUUID();
                await client.query(
                    `INSERT INTO transactions (id, type, amount, description, status, initiator_id, created_at)
                     VALUES ($1, 'DEPOSIT', $2, $3, 'COMPLETED', $4, NOW())`,
                    [txId, params.amount, params.description || 'External Deposit', params.initiatorId]
                );

                // 3. Update account balance
                await client.query(
                    'UPDATE accounts SET balance = $1 WHERE id = $2',
                    [newBalance, params.accountId]
                );

                // 4. Append CREDIT entry to cryptographic ledger
                const ledgerEntry = await appendLedgerEntry(client, {
                    transactionId: txId,
                    accountId: params.accountId,
                    entryType: 'CREDIT',
                    amount: params.amount,
                    runningBalance: newBalance
                });

                await client.query('COMMIT');

                return {
                    transactionId: txId,
                    type: 'DEPOSIT',
                    accountId: params.accountId,
                    amount: params.amount,
                    balanceBefore: currentBalance,
                    balanceAfter: newBalance,
                    ledgerEntryId: ledgerEntry.id,
                    entryHash: ledgerEntry.entry_hash
                };
            } catch (error: any) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release?.();
            }
        });
    }

    /**
     * Executes withdrawal with atomic balance floor check and refusal logging.
     */
    static async withdraw(params: WithdrawalParams) {
        if (params.amount <= 0) {
            throw new Error('Withdrawal amount must be strictly greater than 0');
        }

        return AccountMutex.lock([params.accountId], async () => {
            const client = await db.connect();
            try {
                await client.query('BEGIN');

                // 1. Pessimistic row lock
                const accRes = await client.query(
                    'SELECT * FROM accounts WHERE id = $1 FOR UPDATE',
                    [params.accountId]
                );

                if (accRes.rows.length === 0) {
                    throw new Error(`Account not found: ${params.accountId}`);
                }

                const account = accRes.rows[0];

                // 2. Authorization check
                if (!params.isAdminOverride && account.user_id !== params.initiatorId) {
                    await client.query('ROLLBACK');
                    await logRefusedAttempt({
                        initiatorId: params.initiatorId,
                        sourceAccountId: params.accountId,
                        attemptType: 'WITHDRAWAL',
                        amount: params.amount,
                        failureReason: 'UNAUTHORIZED_CROSS_TENANT_ACCESS'
                    });
                    throw new Error('FORBIDDEN: You do not have authorization to withdraw from this account');
                }

                const currentBalance = Number(account.balance);

                // 3. Balance verification
                if (currentBalance < params.amount) {
                    await client.query('ROLLBACK');
                    await logRefusedAttempt({
                        initiatorId: params.initiatorId,
                        sourceAccountId: params.accountId,
                        attemptType: 'WITHDRAWAL',
                        amount: params.amount,
                        failureReason: `INSUFFICIENT_FUNDS: Available ${currentBalance.toFixed(2)}, requested ${params.amount.toFixed(2)}`
                    });
                    throw new Error(`Insufficient funds: account balance is ${currentBalance.toFixed(2)}, cannot withdraw ${params.amount.toFixed(2)}`);
                }

                const newBalance = Number((currentBalance - params.amount).toFixed(4));

                // 4. Create transaction
                const txId = crypto.randomUUID();
                await client.query(
                    `INSERT INTO transactions (id, type, amount, description, status, initiator_id, created_at)
                     VALUES ($1, 'WITHDRAWAL', $2, $3, 'COMPLETED', $4, NOW())`,
                    [txId, params.amount, params.description || 'External Withdrawal', params.initiatorId]
                );

                // 5. Update account balance
                await client.query(
                    'UPDATE accounts SET balance = $1 WHERE id = $2',
                    [newBalance, params.accountId]
                );

                // 6. Append DEBIT entry to cryptographic ledger
                const ledgerEntry = await appendLedgerEntry(client, {
                    transactionId: txId,
                    accountId: params.accountId,
                    entryType: 'DEBIT',
                    amount: params.amount,
                    runningBalance: newBalance
                });

                await client.query('COMMIT');

                return {
                    transactionId: txId,
                    type: 'WITHDRAWAL',
                    accountId: params.accountId,
                    amount: params.amount,
                    balanceBefore: currentBalance,
                    balanceAfter: newBalance,
                    ledgerEntryId: ledgerEntry.id,
                    entryHash: ledgerEntry.entry_hash
                };
            } catch (error: any) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release?.();
            }
        });
    }

    /**
     * Executes atomic double-entry transfer between two accounts.
     * Enforces sorted lock acquisition to mathematically eliminate deadlocks.
     */
    static async transfer(params: TransferParams) {
        if (params.amount <= 0) {
            throw new Error('Transfer amount must be strictly greater than 0');
        }

        if (params.fromAccountId === params.toAccountId) {
            throw new Error('Self-transfers between identical accounts are not permitted');
        }

        const [firstLockId, secondLockId] = [params.fromAccountId, params.toAccountId].sort();

        return AccountMutex.lock([firstLockId, secondLockId], async () => {
            const client = await db.connect();
            try {
                await client.query('BEGIN');

                // Universally compatible parameterized query with deterministic ordering
                const accountsRes = await client.query(
                    'SELECT * FROM accounts WHERE id IN ($1, $2) ORDER BY id ASC FOR UPDATE',
                    [firstLockId, secondLockId]
                );

                if (accountsRes.rows.length !== 2) {
                    throw new Error('One or both transfer accounts do not exist');
                }

                const fromAccount = accountsRes.rows.find(a => a.id === params.fromAccountId);
                const toAccount = accountsRes.rows.find(a => a.id === params.toAccountId);

                if (!fromAccount || !toAccount) {
                    throw new Error('Failed to resolve both accounts under lock');
                }

                // 1. Authorization check
                if (!params.isAdminOverride && fromAccount.user_id !== params.initiatorId) {
                    await client.query('ROLLBACK');
                    await logRefusedAttempt({
                        initiatorId: params.initiatorId,
                        sourceAccountId: params.fromAccountId,
                        destinationAccountId: params.toAccountId,
                        attemptType: 'TRANSFER',
                        amount: params.amount,
                        failureReason: 'UNAUTHORIZED_CROSS_TENANT_TRANSFER'
                    });
                    throw new Error('FORBIDDEN: You do not own the source account for this transfer');
                }

                // 2. Balance floor check
                const fromBalance = Number(fromAccount.balance);
                const toBalance = Number(toAccount.balance);

                if (fromBalance < params.amount) {
                    await client.query('ROLLBACK');
                    await logRefusedAttempt({
                        initiatorId: params.initiatorId,
                        sourceAccountId: params.fromAccountId,
                        destinationAccountId: params.toAccountId,
                        attemptType: 'TRANSFER',
                        amount: params.amount,
                        failureReason: `INSUFFICIENT_FUNDS: Available ${fromBalance.toFixed(2)}, requested ${params.amount.toFixed(2)}`
                    });
                    throw new Error(`Insufficient funds: Available balance is ₹${fromBalance.toFixed(2)}, required ₹${params.amount.toFixed(2)}`);
                }

                const fromNewBalance = Number((fromBalance - params.amount).toFixed(4));
                const toNewBalance = Number((toBalance + params.amount).toFixed(4));

                // 3. Create parent Transaction (Journal Header)
                const txId = crypto.randomUUID();
                await client.query(
                    `INSERT INTO transactions (id, type, amount, description, status, initiator_id, created_at)
                     VALUES ($1, 'TRANSFER', $2, $3, 'COMPLETED', $4, NOW())`,
                    [txId, params.amount, params.description || 'Account to Account Transfer', params.initiatorId]
                );

                // 4. Update both account balances atomically
                await client.query('UPDATE accounts SET balance = $1 WHERE id = $2', [fromNewBalance, params.fromAccountId]);
                await client.query('UPDATE accounts SET balance = $1 WHERE id = $2', [toNewBalance, params.toAccountId]);

                // 5. DOUBLE-ENTRY LEDGER POSTINGS:
                // Posting A: DEBIT from source account
                const debitEntry = await appendLedgerEntry(client, {
                    transactionId: txId,
                    accountId: params.fromAccountId,
                    entryType: 'DEBIT',
                    amount: params.amount,
                    runningBalance: fromNewBalance
                });

                // Posting B: CREDIT to destination account
                const creditEntry = await appendLedgerEntry(client, {
                    transactionId: txId,
                    accountId: params.toAccountId,
                    entryType: 'CREDIT',
                    amount: params.amount,
                    runningBalance: toNewBalance
                });

                await client.query('COMMIT');

                return {
                    transactionId: txId,
                    type: 'TRANSFER',
                    amount: params.amount,
                    fromAccountId: params.fromAccountId,
                    fromBalanceAfter: fromNewBalance,
                    toAccountId: params.toAccountId,
                    toBalanceAfter: toNewBalance,
                    debitPostingId: debitEntry.id,
                    creditPostingId: creditEntry.id,
                    chainTipHash: creditEntry.entry_hash
                };
            } catch (error: any) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release?.();
            }
        });
    }

    /**
     * Retrieves account statement with every debit, credit, and refused attempt.
     */
    static async getAccountStatement(accountId: string) {
        const postingsRes = await db.query(
            `SELECT 
                le.id AS entry_id,
                le.entry_type,
                le.amount,
                le.running_balance,
                le.prev_hash,
                le.entry_hash,
                le.sequence_num,
                le.created_at,
                t.id AS transaction_id,
                t.type AS transaction_type,
                t.description,
                u.full_name AS initiated_by,
                'SUCCESS' AS status
            FROM ledger_entries le
            JOIN transactions t ON le.transaction_id = t.id
            LEFT JOIN users u ON t.initiator_id = u.id
            WHERE le.account_id = $1
            ORDER BY le.created_at DESC`,
            [accountId]
        );

        const refusedRes = await db.query(
            `SELECT 
                r.id AS entry_id,
                'REFUSED' AS entry_type,
                r.amount,
                NULL as running_balance,
                NULL as prev_hash,
                NULL as entry_hash,
                NULL as sequence_num,
                r.attempted_at AS created_at,
                NULL AS transaction_id,
                r.attempt_type AS transaction_type,
                r.failure_reason AS description,
                u.full_name AS initiated_by,
                'REFUSED' AS status
            FROM refused_attempts r
            LEFT JOIN users u ON r.initiator_id = u.id
            WHERE r.source_account_id = $1 OR r.destination_account_id = $1
            ORDER BY r.attempted_at DESC`,
            [accountId]
        );

        // Merge and sort combined statement chronologically
        const combined = [...postingsRes.rows, ...refusedRes.rows].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        return combined;
    }

    /**
     * Checks the system-wide Conservation Invariant:
     * Total user balances == Total Deposits - Total Withdrawals.
     */
    static async getSystemConservationStatus() {
        const balancesRes = await db.query('SELECT COALESCE(SUM(balance), 0) AS total_balance FROM accounts');
        const depositsRes = await db.query("SELECT COALESCE(SUM(amount), 0) AS total_deposits FROM transactions WHERE type = 'DEPOSIT'");
        const withdrawalsRes = await db.query("SELECT COALESCE(SUM(amount), 0) AS total_withdrawals FROM transactions WHERE type = 'WITHDRAWAL'");

        const totalBalance = Number(balancesRes.rows[0].total_balance);
        const totalDeposits = Number(depositsRes.rows[0].total_deposits);
        const totalWithdrawals = Number(withdrawalsRes.rows[0].total_withdrawals);
        const expectedBalance = Number((totalDeposits - totalWithdrawals).toFixed(4));
        const discrepancy = Number(Math.abs(totalBalance - expectedBalance).toFixed(4));

        return {
            totalUserBalances: totalBalance,
            totalExternalDeposits: totalDeposits,
            totalExternalWithdrawals: totalWithdrawals,
            expectedSystemBalance: expectedBalance,
            discrepancy,
            isBalanced: discrepancy === 0
        };
    }
}
