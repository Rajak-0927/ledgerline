import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api.js';
import { AuditVerificationResult, ConservationStatus } from '../types.js';
import { ShieldCheck, Scale, AlertTriangle, RefreshCw, CheckCircle2, Hash, Lock, Search } from 'lucide-react';

export const AuditorConsole: React.FC = () => {
  const [chainResult, setChainResult] = useState<AuditVerificationResult | null>(null);
  const [conservationResult, setConservationResult] = useState<ConservationStatus | null>(null);
  const [refusedAttempts, setRefusedAttempts] = useState<any[]>([]);
  const [loadingChain, setLoadingChain] = useState<boolean>(false);
  const [loadingConservation, setLoadingConservation] = useState<boolean>(false);
  const [loadingRefused, setLoadingRefused] = useState<boolean>(false);

  useEffect(() => {
    runFullAudit();
  }, []);

  const runFullAudit = () => {
    verifyChain();
    verifyConservation();
    fetchRefusedAttempts();
  };

  const verifyChain = async () => {
    setLoadingChain(true);
    try {
      const data = await apiRequest<AuditVerificationResult>('/audit/verify-chain');
      setChainResult(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingChain(false);
    }
  };

  const verifyConservation = async () => {
    setLoadingConservation(true);
    try {
      const data = await apiRequest<ConservationStatus>('/audit/conservation-status');
      setConservationResult(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingConservation(false);
    }
  };

  const fetchRefusedAttempts = async () => {
    setLoadingRefused(true);
    try {
      const data = await apiRequest<any>('/audit/refused-attempts');
      setRefusedAttempts(data.refusedAttempts || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingRefused(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-800/50 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="bg-emerald-600/20 text-emerald-400 p-3 rounded-xl border border-emerald-500/30">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white">Auditor Proof & Mathematical Verification Console</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Provably verify that money is conserved (Delta = 0), the ledger is append-only with an unbroken SHA-256 cryptographic chain, and all unauthorized or refused transactions are recorded.
            </p>
          </div>
        </div>

        <button
          onClick={runFullAudit}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center space-x-2 shadow-lg shadow-emerald-950 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingChain || loadingConservation ? 'animate-spin' : ''}`} />
          <span>Execute Full Audit</span>
        </button>
      </div>

      {/* Two Pillars Grid: Chain Verification & Conservation Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Cryptographic Hash Chain Audit */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Hash className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Cryptographic Hash Chain Proof</h3>
              </div>
              <button
                onClick={verifyChain}
                className="text-[11px] text-slate-400 hover:text-white flex items-center space-x-1"
              >
                <RefreshCw className={`w-3 h-3 ${loadingChain ? 'animate-spin' : ''}`} />
                <span>Re-verify</span>
              </button>
            </div>

            {chainResult ? (
              <div className="space-y-3">
                <div className={`p-4 rounded-xl border flex items-center space-x-3 ${
                  chainResult.status === 'PASSED_CRYPTOGRAPHICALLY_SOUND'
                    ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-700/60 text-rose-300'
                }`}>
                  {chainResult.status === 'PASSED_CRYPTOGRAPHICALLY_SOUND' ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0" />
                  )}
                  <div>
                    <div className="font-bold text-sm">
                      {chainResult.status === 'PASSED_CRYPTOGRAPHICALLY_SOUND'
                        ? 'CHAIN INTACT — ZERO TAMPERING DETECTED'
                        : 'ALERT: CHAIN CORRUPTED OR TAMPERED'}
                    </div>
                    <div className="text-xs opacity-90 mt-0.5">
                      Verified {chainResult.details.totalVerified} sequential postings against SHA-256 parents.
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono space-y-1.5 text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Genesis Parent:</span>
                    <span>0000000000000000...</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tip Hash:</span>
                    <span className="text-emerald-400">{chainResult.tipHash ? chainResult.tipHash.substring(0, 20) + '...' : 'None'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Verification Engine:</span>
                    <span>SHA-256 Chaining</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 font-mono py-8 text-center">Loading chain audit...</div>
            )}
          </div>

          <p className="text-[11px] text-slate-500 mt-4">
            PostgreSQL triggers prevent SQL `UPDATE` and `DELETE`. Even if raw disk is modified, SHA-256 recomputation will immediately pinpoint the exact corrupted row.
          </p>
        </div>

        {/* Card 2: System Money Conservation Invariant */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Scale className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">System Conservation Invariant</h3>
              </div>
              <button
                onClick={verifyConservation}
                className="text-[11px] text-slate-400 hover:text-white flex items-center space-x-1"
              >
                <RefreshCw className={`w-3 h-3 ${loadingConservation ? 'animate-spin' : ''}`} />
                <span>Re-verify</span>
              </button>
            </div>

            {conservationResult ? (
              <div className="space-y-3">
                <div className={`p-4 rounded-xl border flex items-center space-x-3 ${
                  conservationResult.metrics.isBalanced
                    ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-700/60 text-rose-300'
                }`}>
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-bold text-sm">
                      {conservationResult.metrics.isBalanced
                        ? 'BOOKS ARE PERFECTLY BALANCED (Δ = ₹0.00)'
                        : 'SYSTEM IMBALANCE DETECTED'}
                    </div>
                    <div className="text-xs opacity-90 mt-0.5 font-mono">
                      Invariant: Sum(Balances) == Sum(Deposits) - Sum(Withdrawals)
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div className="text-slate-500 text-[10px]">Total User Balances</div>
                    <div className="text-slate-200 font-bold text-sm mt-0.5">₹{conservationResult.metrics.totalUserBalances.toLocaleString()}</div>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div className="text-slate-500 text-[10px]">External Deposits</div>
                    <div className="text-emerald-400 font-bold text-sm mt-0.5">₹{conservationResult.metrics.totalExternalDeposits.toLocaleString()}</div>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div className="text-slate-500 text-[10px]">External Withdrawals</div>
                    <div className="text-rose-400 font-bold text-sm mt-0.5">₹{conservationResult.metrics.totalExternalWithdrawals.toLocaleString()}</div>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div className="text-slate-500 text-[10px]">Net Discrepancy</div>
                    <div className="text-slate-200 font-bold text-sm mt-0.5">₹{conservationResult.metrics.discrepancy.toFixed(4)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 font-mono py-8 text-center">Loading conservation audit...</div>
            )}
          </div>

          <p className="text-[11px] text-slate-500 mt-4">
            Zero money created or lost. Internal transfers net to ₹0; balances change only via audited external inflows and outflows.
          </p>
        </div>
      </div>

      {/* Refused Attempts Security Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Refused Attempts Security Log</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Autonomous records of failed race attacks, unauthorized cross-tenant operations, and overdraw attempts
            </p>
          </div>
          <span className="text-xs font-mono bg-amber-950/60 text-amber-300 border border-amber-800/60 px-2.5 py-1 rounded-full">
            {refusedAttempts.length} Logged Refusals
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Attempted Action</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Failure Reason</th>
                <th className="py-3 px-4">Initiator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {refusedAttempts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                    No refused attempts recorded yet.
                  </td>
                </tr>
              ) : (
                refusedAttempts.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition bg-amber-950/5">
                    <td className="py-3 px-4 text-slate-400 text-[11px]">
                      {new Date(item.attempted_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-semibold text-amber-400 font-sans">
                      {item.attempt_type}
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      ₹{item.amount ? Number(item.amount).toLocaleString() : 'N/A'}
                    </td>
                    <td className="py-3 px-4 font-sans text-rose-300">
                      {item.failure_reason}
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-sans">
                      {item.initiator_name || item.initiator_email || 'Unknown'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
