import React, { useState } from 'react';
import { StatementEntry } from '../types.js';
import { ArrowDownLeft, ArrowUpRight, AlertOctagon, Hash, ShieldCheck, Clock, User } from 'lucide-react';

interface StatementViewProps {
  entries: StatementEntry[];
  accountNumber: string;
  currentBalance: number;
  loading: boolean;
  onRefresh: () => void;
}

export const StatementView: React.FC<StatementViewProps> = ({
  entries,
  accountNumber,
  currentBalance,
  loading,
  onRefresh
}) => {
  const [filter, setFilter] = useState<'ALL' | 'SUCCESS' | 'REFUSED'>('ALL');

  const filteredEntries = entries.filter((e) => {
    if (filter === 'SUCCESS') return e.status === 'SUCCESS';
    if (filter === 'REFUSED') return e.status === 'REFUSED';
    return true;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-800 bg-slate-900/60 flex flex-wrap gap-4 items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-base font-bold text-white">Immutable Ledger Statement</h3>
            <span className="text-xs bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded border border-slate-700">
              {accountNumber}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Append-only postings with running balances and recorded refusal evidence
          </p>
        </div>

        {/* Filter Badges & Refresh */}
        <div className="flex items-center space-x-2">
          <div className="bg-slate-950 p-1 rounded-lg border border-slate-800 flex text-xs">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-2.5 py-1 rounded-md transition ${filter === 'ALL' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              All ({entries.length})
            </button>
            <button
              onClick={() => setFilter('SUCCESS')}
              className={`px-2.5 py-1 rounded-md transition ${filter === 'SUCCESS' ? 'bg-emerald-950 text-emerald-300 font-semibold border border-emerald-800/40' : 'text-slate-400 hover:text-emerald-300'}`}
            >
              Completed ({entries.filter(e => e.status === 'SUCCESS').length})
            </button>
            <button
              onClick={() => setFilter('REFUSED')}
              className={`px-2.5 py-1 rounded-md transition ${filter === 'REFUSED' ? 'bg-amber-950 text-amber-300 font-semibold border border-amber-800/40' : 'text-slate-400 hover:text-amber-300'}`}
            >
              Refused ({entries.filter(e => e.status === 'REFUSED').length})
            </button>
          </div>

          <button
            onClick={onRefresh}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 transition"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
            <tr>
              <th className="py-3 px-4">Type / Action</th>
              <th className="py-3 px-4">Description & Refusal Reason</th>
              <th className="py-3 px-4 text-right">Amount</th>
              <th className="py-3 px-4 text-right">Running Balance</th>
              <th className="py-3 px-4">Initiated By</th>
              <th className="py-3 px-4">Cryptographic Hash / Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                  No ledger activity found matching filter.
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => {
                const isDebit = entry.entry_type === 'DEBIT';
                const isCredit = entry.entry_type === 'CREDIT';
                const isRefused = entry.status === 'REFUSED';

                return (
                  <tr
                    key={entry.entry_id}
                    className={`hover:bg-slate-800/30 transition ${
                      isRefused ? 'bg-amber-950/10' : ''
                    }`}
                  >
                    {/* Direction Badge */}
                    <td className="py-3 px-4">
                      {isCredit && (
                        <span className="inline-flex items-center space-x-1 text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-2 py-0.5 rounded text-[11px] font-semibold font-sans">
                          <ArrowDownLeft className="w-3 h-3" />
                          <span>CREDIT</span>
                        </span>
                      )}
                      {isDebit && (
                        <span className="inline-flex items-center space-x-1 text-rose-400 bg-rose-950/40 border border-rose-800/60 px-2 py-0.5 rounded text-[11px] font-semibold font-sans">
                          <ArrowUpRight className="w-3 h-3" />
                          <span>DEBIT</span>
                        </span>
                      )}
                      {isRefused && (
                        <span className="inline-flex items-center space-x-1 text-amber-400 bg-amber-950/40 border border-amber-800/60 px-2 py-0.5 rounded text-[11px] font-semibold font-sans">
                          <AlertOctagon className="w-3 h-3" />
                          <span>REFUSED</span>
                        </span>
                      )}
                    </td>

                    {/* Description */}
                    <td className="py-3 px-4 font-sans">
                      <div className="font-medium text-slate-200">
                        {entry.transaction_type}
                      </div>
                      <div className={`text-[11px] ${isRefused ? 'text-amber-400 font-medium' : 'text-slate-400'}`}>
                        {entry.description}
                      </div>
                    </td>

                    {/* Amount */}
                    <td className={`py-3 px-4 text-right font-bold text-sm ${
                      isCredit ? 'text-emerald-400' : isDebit ? 'text-rose-400' : 'text-slate-400 line-through'
                    }`}>
                      {isCredit ? '+' : isDebit ? '-' : ''}₹{Number(entry.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Running Balance */}
                    <td className="py-3 px-4 text-right font-semibold text-slate-200">
                      {entry.running_balance !== null ? (
                        <span>₹{Number(entry.running_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      ) : (
                        <span className="text-slate-600 text-xs italic">Unchanged</span>
                      )}
                    </td>

                    {/* Initiated By */}
                    <td className="py-3 px-4 font-sans text-slate-300">
                      <div className="flex items-center space-x-1">
                        <User className="w-3 h-3 text-slate-500" />
                        <span>{entry.initiated_by || 'Unknown Actor'}</span>
                      </div>
                    </td>

                    {/* Cryptographic Hash / Timestamp */}
                    <td className="py-3 px-4 text-[10px] text-slate-400">
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{new Date(entry.created_at).toLocaleString()}</span>
                      </div>
                      {entry.entry_hash && (
                        <div className="flex items-center space-x-1 mt-0.5 text-slate-500 hover:text-emerald-400 cursor-pointer" title={`Full SHA256: ${entry.entry_hash}`}>
                          <Hash className="w-3 h-3 text-slate-600" />
                          <span>{entry.entry_hash.substring(0, 18)}...</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
