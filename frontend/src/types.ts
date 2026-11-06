export type UserRole = 'ADMIN' | 'ACCOUNT_HOLDER' | 'AUDITOR';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
}

export interface Account {
  id: string;
  user_id: string;
  account_number: string;
  account_type: 'SAVINGS' | 'CHECKING' | 'SYSTEM_EXTERNAL';
  balance: string | number;
  currency: string;
  status: string;
  created_at: string;
  owner_name?: string;
  owner_email?: string;
}

export interface StatementEntry {
  entry_id: string;
  entry_type: 'DEBIT' | 'CREDIT' | 'REFUSED';
  amount: string | number;
  running_balance: string | number | null;
  prev_hash: string | null;
  entry_hash: string | null;
  sequence_num: string | number | null;
  created_at: string;
  transaction_id: string | null;
  transaction_type: string;
  description: string;
  initiated_by: string;
  status: 'SUCCESS' | 'REFUSED';
}

export interface AuditVerificationResult {
  timestamp: string;
  status: 'PASSED_CRYPTOGRAPHICALLY_SOUND' | 'FAILED_TAMPERING_DETECTED';
  details: {
    isValid: boolean;
    totalVerified: number;
    brokenAtSequence?: number;
    brokenEntryId?: string;
    reason?: string;
  };
  tipHash: string | null;
}

export interface ConservationStatus {
  timestamp: string;
  status: 'BALANCED' | 'IMBALANCED_ALERT';
  metrics: {
    totalUserBalances: number;
    totalExternalDeposits: number;
    totalExternalWithdrawals: number;
    expectedSystemBalance: number;
    discrepancy: number;
    isBalanced: boolean;
  };
}
