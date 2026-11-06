import React, { useState, useEffect } from 'react';
import { Account } from '../types.js';
import { apiRequest } from '../api.js';
import { ArrowDownLeft, ArrowUpRight, KeyRound, ShieldAlert, CheckCircle2, RefreshCw } from 'lucide-react';

interface DepositWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account | null;
  mode: 'DEPOSIT' | 'WITHDRAWAL';
  onSuccess: () => void;
}

export const DepositWithdrawModal: React.FC<DepositWithdrawModalProps> = ({
  isOpen,
  onClose,
  account,
  mode,
  onSuccess
}) => {
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIdempotencyKey(`${mode.toLowerCase()}_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`);
      setError(null);
      setResult(null);
      setAmount('');
    }
  }, [isOpen, mode]);

  if (!isOpen || !account) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Please enter a valid positive amount');
      }

      const endpoint = mode === 'DEPOSIT' ? '/deposits' : '/withdrawals';

      const res = await apiRequest(endpoint, {
        method: 'POST',
        idempotencyKey,
        body: JSON.stringify({
          accountId: account.id,
          amount: parsedAmount,
          description: description || `External ${mode}`
        })
      });

      setResult(res);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/60">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              {mode === 'DEPOSIT' ? (
                <>
                  <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                  <span>External Capital Deposit</span>
                </>
              ) : (
                <>
                  <ArrowUpRight className="w-4 h-4 text-rose-400" />
                  <span>External Withdrawal</span>
                </>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Target Account: <span className="font-mono text-slate-200">{account.account_number}</span> (Available: ₹{Number(account.balance).toLocaleString()})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-mono p-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Amount (₹ INR)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-slate-400 text-sm font-bold">₹</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            {mode === 'WITHDRAWAL' && (
              <p className="text-[11px] text-slate-500 mt-1">
                Attempting to withdraw more than ₹{Number(account.balance).toLocaleString()} will be rejected by the balance floor and logged in the statement.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              placeholder={mode === 'DEPOSIT' ? 'e.g. Bank Wire Inflow' : 'e.g. ATM Cash Withdrawal'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Idempotency Key */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center space-x-1.5 text-xs text-amber-400 font-semibold mb-1">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Idempotency-Key Header</span>
            </div>
            <input
              type="text"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-amber-200 font-mono focus:outline-none"
            />
          </div>

          {error && (
            <div className="bg-rose-950/50 border border-rose-800/80 rounded-lg p-3 text-xs text-rose-300 flex items-start space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Refused / Error:</span> {error}
              </div>
            </div>
          )}

          {result && (
            <div className="bg-emerald-950/50 border border-emerald-800/80 rounded-lg p-3 text-xs text-emerald-300">
              <div className="flex items-center space-x-1.5 font-semibold mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Operation Completed</span>
              </div>
              <div className="text-[11px] text-slate-300 font-mono mt-1">
                New Balance: ₹{result.data?.balanceAfter} (Hash: {result.data?.entryHash?.substring(0, 16)}...)
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow-lg flex items-center space-x-2 transition ${
                mode === 'DEPOSIT'
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/50'
                  : 'bg-rose-600 hover:bg-rose-500 shadow-rose-950/50'
              }`}
            >
              {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{loading ? 'Processing...' : `Execute ${mode}`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
