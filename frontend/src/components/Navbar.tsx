import React from 'react';
import { User, UserRole } from '../types.js';
import { ShieldCheck, UserCheck, ArrowRightLeft, Lock, LogOut } from 'lucide-react';

interface NavbarProps {
  currentUser: User | null;
  onSwitchUser: (role: 'alice' | 'bob' | 'admin' | 'auditor') => void;
  onLogout: () => void;
  activeTab: 'dashboard' | 'auditor' | 'admin';
  setActiveTab: (tab: 'dashboard' | 'auditor' | 'admin') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onSwitchUser,
  onLogout,
  activeTab,
  setActiveTab
}) => {
  const getRoleBadge = (role?: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return <span className="bg-purple-900/40 text-purple-300 border border-purple-700/50 px-2 py-0.5 rounded text-xs font-semibold">ADMIN</span>;
      case 'AUDITOR':
        return <span className="bg-emerald-900/40 text-emerald-300 border border-emerald-700/50 px-2 py-0.5 rounded text-xs font-semibold">AUDITOR</span>;
      default:
        return <span className="bg-blue-900/40 text-blue-300 border border-blue-700/50 px-2 py-0.5 rounded text-xs font-semibold">ACCOUNT HOLDER</span>;
    }
  };

  return (
    <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-emerald-600 to-teal-500 p-2 rounded-lg text-white shadow-lg shadow-emerald-900/30">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-lg tracking-tight text-white">Ledger<span className="text-emerald-400">Line</span></span>
              <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-1.5 py-0.2 rounded font-mono">v1.0-PROVABLE</span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">Double-Entry Money Movement Engine</p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        {currentUser && (
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'dashboard'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Accounts & Ledger
            </button>

            {(currentUser.role === 'AUDITOR' || currentUser.role === 'ADMIN') && (
              <button
                onClick={() => setActiveTab('auditor')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center space-x-1.5 ${
                  activeTab === 'auditor'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                    : 'text-slate-400 hover:text-emerald-300'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Auditor Proof Console</span>
              </button>
            )}

            {currentUser.role === 'ADMIN' && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center space-x-1.5 ${
                  activeTab === 'admin'
                    ? 'bg-purple-950 text-purple-300 border border-purple-800/60'
                    : 'text-slate-400 hover:text-purple-300'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Admin Operations</span>
              </button>
            )}
          </div>
        )}

        {/* Quick Demo Role Switcher & User Details */}
        <div className="flex items-center space-x-3">
          {currentUser ? (
            <>
              {/* Quick Persona Switcher for Evaluators */}
              <div className="relative group">
                <button className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-2.5 py-1.5 rounded-md border border-slate-700 flex items-center space-x-1.5">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden md:inline">Quick Switch:</span>
                  <span className="font-semibold text-white">{currentUser.full_name.split(' ')[0]}</span>
                </button>
                <div className="absolute right-0 mt-1 w-52 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl py-1 hidden group-hover:block z-50">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Evaluation Personas</div>
                  <button
                    onClick={() => onSwitchUser('alice')}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 flex justify-between items-center"
                  >
                    <span>Alice (₹5,000)</span>
                    <span className="text-[10px] text-blue-400">User</span>
                  </button>
                  <button
                    onClick={() => onSwitchUser('bob')}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 flex justify-between items-center"
                  >
                    <span>Bob (₹2,500)</span>
                    <span className="text-[10px] text-blue-400">User</span>
                  </button>
                  <button
                    onClick={() => onSwitchUser('admin')}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 flex justify-between items-center"
                  >
                    <span>System Admin</span>
                    <span className="text-[10px] text-purple-400">Admin</span>
                  </button>
                  <button
                    onClick={() => onSwitchUser('auditor')}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 flex justify-between items-center"
                  >
                    <span>Lead Auditor</span>
                    <span className="text-[10px] text-emerald-400">Auditor</span>
                  </button>
                </div>
              </div>

              {/* User Pill */}
              <div className="hidden lg:flex items-center space-x-2 pl-2 border-l border-slate-800">
                <div className="text-right">
                  <div className="text-xs font-semibold text-slate-200">{currentUser.full_name}</div>
                  <div className="text-[10px] text-slate-400">{currentUser.email}</div>
                </div>
                {getRoleBadge(currentUser.role)}
              </div>

              {/* Logout */}
              <button
                onClick={onLogout}
                className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="text-xs text-slate-400 font-mono">Authentication Required</div>
          )}
        </div>
      </div>
    </header>
  );
};
