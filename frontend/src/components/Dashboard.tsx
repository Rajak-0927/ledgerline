import React, { useState, useEffect } from 'react';
import { Account, StatementEntry, User } from '../types.js';
import { apiRequest } from '../api.js';
import { StatementView } from './StatementView.js';
import { TransferModal } from './TransferModal.js';
import { DepositWithdrawModal } from './DepositWithdrawModal.js';
import { Wallet, ArrowRightLeft, ArrowDownLeft, ArrowUpRight, Shield, RefreshCw } from 'lucide-react';

interface DashboardProps {
  currentUser: User;
}

export const Dashboard: React.FC<DashboardProps> = ({ currentUser }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [statement, setStatement] = useState<StatementEntry[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState<boolean>(true);
  const [loadingStatement, setLoadingStatement] = useState<boolean>(false);

  // Modals
  const [isTransferOpen, setIsTransferOpen] = useState<boolean>(false);
  const [depositWithdrawModal, setDepositWithdrawModal] = useState<{
    isOpen: boolean;
    mode: 'DEPOSIT' | 'WITHDRAWAL';
  }>({ isOpen: false, mode: 'DEPOSIT' });

  useEffect(() => {
    fetchAccounts();
  }, [currentUser]);

  useEffect(() => {
    if (selectedAccountId) {
      fetchStatement(selectedAccountId);
    }
  }, [selectedAccountId]);

  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const data = await apiRequest<{ accounts: Account[] }>('/accounts');
      setAccounts(data.accounts || []);
      if (data.accounts?.length > 0 && !selectedAccountId) {
        setSelectedAccountId(data.accounts[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const fetchStatement = async (accId: string) => {
    setLoadingStatement(true);
    try {
      const data = await apiRequest<{ statement: StatementEntry[] }>(`/accounts/${accId}/statement`);
      setStatement(data.statement || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStatement(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0] || null;

  return (
    <div className="space-y-6">
      {/* Top Controls & Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center space-x-2">
            <span>Welcome back, {currentUser.full_name}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Accounts under active balance protection and append-only cryptographic ledger tracking.
          </p>
        </div>

        {/* Action Triggers */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setDepositWithdrawModal({ isOpen: true, mode: 'DEPOSIT' })}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-700 flex items-center space-x-2 transition"
          >
            <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
            <span>Deposit</span>
          </button>

          <button
            onClick={() => setDepositWithdrawModal({ isOpen: true, mode: 'WITHDRAWAL' })}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-700 flex items-center space-x-2 transition"
          >
            <ArrowUpRight className="w-4 h-4 text-rose-400" />
            <span>Withdraw</span>
          </button>

          <button
            onClick={() => setIsTransferOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-950 flex items-center space-x-2 transition"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Transfer Money</span>
          </button>
        </div>
      </div>

      {/* Account Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loadingAccounts ? (
          <div className="col-span-full py-8 text-center text-xs text-slate-500 font-mono">
            Loading accounts...
          </div>
        ) : accounts.length === 0 ? (
          <div className="col-span-full py-8 text-center text-xs text-slate-500 font-mono">
            No accounts found for this user.
          </div>
        ) : (
          accounts.map((acc) => {
            const isSelected = acc.id === selectedAccountId;
            return (
              <div
                key={acc.id}
                onClick={() => setSelectedAccountId(acc.id)}
                className={`p-5 rounded-2xl border cursor-pointer transition relative overflow-hidden ${
                  isSelected
                    ? 'bg-slate-900 border-emerald-500/80 shadow-lg shadow-emerald-950/30 ring-1 ring-emerald-500/50'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
                  <div className="flex items-center space-x-2 font-mono">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                    <span>{acc.account_number}</span>
                  </div>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-semibold">
                    {acc.account_type}
                  </span>
                </div>

                <div className="mb-2">
                  <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Available Balance</div>
                  <div className="text-2xl font-black text-white font-mono mt-0.5">
                    ₹{Number(acc.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 mt-4 pt-3 border-t border-slate-800/80">
                  <span>Owner: {acc.owner_name || currentUser.full_name}</span>
                  <span className="text-emerald-400 flex items-center space-x-1 font-mono text-[10px]">
                    <Shield className="w-3 h-3" />
                    <span>Floor: ₹0.00</span>
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Selected Account Statement */}
      {selectedAccount && (
        <StatementView
          entries={statement}
          accountNumber={selectedAccount.account_number}
          currentBalance={Number(selectedAccount.balance)}
          loading={loadingStatement}
          onRefresh={() => fetchStatement(selectedAccount.id)}
        />
      )}

      {/* Transfer Modal */}
      <TransferModal
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
        accounts={accounts}
        onSuccess={() => {
          fetchAccounts();
          if (selectedAccountId) fetchStatement(selectedAccountId);
        }}
      />

      {/* Deposit/Withdraw Modal */}
      <DepositWithdrawModal
        isOpen={depositWithdrawModal.isOpen}
        onClose={() => setDepositWithdrawModal({ isOpen: false, mode: 'DEPOSIT' })}
        account={selectedAccount}
        mode={depositWithdrawModal.mode}
        onSuccess={() => {
          fetchAccounts();
          if (selectedAccountId) fetchStatement(selectedAccountId);
        }}
      />
    </div>
  );
};
