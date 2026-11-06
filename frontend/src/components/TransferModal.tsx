import React, { useState, useEffect } from 'react';
import { Account } from '../types.js';
import { apiRequest } from '../api.js';
import { ArrowRight, RefreshCw, KeyRound, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  onSuccess: () => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  accounts,
  onSuccess
}) => {
  const [fromAccountId, setFromAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  // Generate random UUID key on open
  useEffect(() => {
    if (isOpen) {
      if (accounts.length > 0 && !fromAccountId) {
        setFromAccountId(accounts[0].id);
      }
      regenerateKey();
      setError(null);
      setResult(null);
    }
  }, [isOpen, accounts]);

  const regenerateKey = () => {
    setIdempotencyKey('req_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36));
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Please enter a valid positive transfer amount');
      }

      if (!toAccountId.trim()) {
        throw new Error('Please specify the destination account ID or number');
      }

      const res = await apiRequest('/transfers', {
        method: 'POST',
        idempotencyKey,
        body: JSON.stringify({
          fromAccountId,
          toAccountId: toAccountId.trim(),
          amount: parsedAmount,
          description: description || 'Account Transfer'
        })
      });

      setResult(res);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Transfer failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/60">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <ArrowRight className="w-4 h-4 text-emerald-400" />
              <span>Initiate Money Transfer</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Atomic double-entry transfer with concurrency lock</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-mono p-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Source Account */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              From Account (Source)
            </label>
            <select
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.account_number} — ₹{Number(acc.balance).toLocaleString()} ({acc.account_type})
                </option>
              ))}
            </select>
          </div>

          {/* Destination Account */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Destination Account ID or Number
            </label>
            <input
              type="text"
              required
              placeholder="e.g. LL-1000000002 or account UUID"
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 font-mono placeholder:text-slate-600"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Tip: Transfer to Bob's account or another user's account to test double-entry conservation.
            </p>
          </div>

          {/* Amount */}
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
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Vendor Invoice Payment"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Idempotency Key Inspection Box */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center space-x-1.5 text-xs text-amber-400 font-semibold">
                <KeyRound className="w-3.5 h-3.5" />
                <span>Idempotency-Key (Replay Protection)</span>
              </div>
              <button
                type="button"
                onClick={regenerateKey}
                className="text-[11px] text-slate-400 hover:text-white flex items-center space-x-1 hover:underline"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Generate New</span>
              </button>
            </div>
            <input
              type="text"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-amber-200 font-mono focus:outline-none"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Clicking <b>Send Transfer</b> multiple times with this exact key tests replay safety: the money moves only once and returns the cached answer.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-rose-950/50 border border-rose-800/80 rounded-lg p-3 text-xs text-rose-300 flex items-start space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Transaction Refused / Error:</span> {error}
              </div>
            </div>
          )}

          {/* Success Message */}
          {result && (
            <div className="bg-emerald-950/50 border border-emerald-800/80 rounded-lg p-3 text-xs text-emerald-300">
              <div className="flex items-center space-x-1.5 font-semibold mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  {result._isReplayed ? '⚡ Replayed Request (Identical Response Cached — Money Moved Once)' : 'Transfer Completed Successfully'}
                </span>
              </div>
              <div className="text-[11px] text-slate-300 font-mono space-y-0.5 mt-2 bg-slate-950 p-2 rounded border border-slate-800">
                <div>Tx ID: {result.data?.transactionId}</div>
                <div>Amount: ₹{result.data?.amount}</div>
                <div>Hash Tip: {result.data?.chainTipHash?.substring(0, 24)}...</div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
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
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow-lg shadow-emerald-950/50 flex items-center space-x-2 transition"
            >
              {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{loading ? 'Executing Under Lock...' : 'Execute Transfer'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
