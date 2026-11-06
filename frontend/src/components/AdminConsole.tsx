import React, { useState, useEffect } from 'react';
import { Account } from '../types.js';
import { apiRequest } from '../api.js';
import { Lock, PlusCircle, Building, CheckCircle2, AlertCircle } from 'lucide-react';

interface AdminConsoleProps {
  onAccountCreated: () => void;
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({ onAccountCreated }) => {
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [accountType, setAccountType] = useState<'SAVINGS' | 'CHECKING'>('SAVINGS');
  const [initialBalance, setInitialBalance] = useState<string>('1000');
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchAllAccounts();
  }, []);

  const fetchAllAccounts = async () => {
    try {
      const data = await apiRequest<{ accounts: Account[] }>('/accounts');
      setAllAccounts(data.accounts || []);
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMessage(null);

    try {
      const balanceNum = parseFloat(initialBalance) || 0;
      await apiRequest('/accounts', {
        method: 'POST',
        body: JSON.stringify({
          accountType,
          initialBalance: balanceNum
        })
      });

      setStatusMessage('New account created and seeded successfully!');
      setInitialBalance('1000');
      fetchAllAccounts();
      onAccountCreated();
    } catch (err: any) {
      setStatusMessage('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-purple-900/50 rounded-2xl p-6 shadow-xl flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="bg-purple-900/40 text-purple-400 p-3 rounded-xl border border-purple-700/50">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white">System Administrator Management</h2>
            <p className="text-xs text-slate-400 mt-1">
              Manage multi-tenant accounts, provision internal ledgers, and supervise system invariants.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create Account Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2 mb-4">
            <PlusCircle className="w-4 h-4 text-purple-400" />
            <span>Provision New Account</span>
          </h3>

          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Account Type
              </label>
              <select
                value={accountType}
                onChange={(e: any) => setAccountType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100"
              >
                <option value="SAVINGS">SAVINGS</option>
                <option value="CHECKING">CHECKING</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Initial Opening Balance (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono"
              />
            </div>

            {statusMessage && (
              <div className={`p-3 rounded-lg text-xs ${
                statusMessage.startsWith('Error')
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }`}>
                {statusMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-lg shadow-lg shadow-purple-950/50 transition"
            >
              {loading ? 'Provisioning...' : 'Provision Account'}
            </button>
          </form>
        </div>

        {/* Global Accounts List */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl overflow-hidden">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2 mb-4">
            <Building className="w-4 h-4 text-slate-400" />
            <span>All System Accounts ({allAccounts.length})</span>
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Account Number</th>
                  <th className="py-2.5 px-3">Owner</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">Balance</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {allAccounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-semibold text-slate-200">{acc.account_number}</td>
                    <td className="py-2.5 px-3 font-sans text-slate-300">{acc.owner_name || 'N/A'}</td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">{acc.account_type}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                      ₹{Number(acc.balance).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-[11px]">
                      <span className="text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                        {acc.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
