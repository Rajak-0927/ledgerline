import React, { useState, useEffect } from 'react';
import { User } from './types.js';
import { apiRequest, setStoredToken, clearStoredToken } from './api.js';
import { Navbar } from './components/Navbar.js';
import { Dashboard } from './components/Dashboard.js';
import { AuditorConsole } from './components/AuditorConsole.js';
import { AdminConsole } from './components/AdminConsole.js';
import { ShieldCheck, UserCheck, ArrowRight, Lock } from 'lucide-react';

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'auditor' | 'admin'>('dashboard');

  // Login form state
  const [email, setEmail] = useState<string>('alice@ledgerline.local');
  const [password, setPassword] = useState<string>('Password@123');
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    checkCurrentUser();
  }, []);

  const checkCurrentUser = async () => {
    try {
      const data = await apiRequest<{ user: User }>('/auth/me');
      setCurrentUser(data.user);
    } catch (e) {
      // Not logged in or invalid token
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);
    try {
      const data = await apiRequest<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      setStoredToken(data.token);
      setCurrentUser(data.user);
      if (data.user.role === 'AUDITOR') {
        setActiveTab('auditor');
      } else {
        setActiveTab('dashboard');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Login failed');
    }
  };

  const handleQuickSwitch = async (persona: 'alice' | 'bob' | 'admin' | 'auditor') => {
    let targetEmail = 'alice@ledgerline.local';
    if (persona === 'bob') targetEmail = 'bob@ledgerline.local';
    if (persona === 'admin') targetEmail = 'admin@ledgerline.local';
    if (persona === 'auditor') targetEmail = 'auditor@ledgerline.local';

    setEmail(targetEmail);
    setPassword('Password@123');

    try {
      const data = await apiRequest<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: targetEmail, password: 'Password@123' })
      });
      setStoredToken(data.token);
      setCurrentUser(data.user);
      if (data.user.role === 'AUDITOR') {
        setActiveTab('auditor');
      } else {
        setActiveTab('dashboard');
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    clearStoredToken();
    setCurrentUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 font-mono text-sm">
        Initializing LedgerLine Engine...
      </div>
    );
  }

  // Not logged in: Show Evaluation Login Screen
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-gradient-to-tr from-emerald-600 to-teal-500 p-2.5 rounded-xl text-white shadow-lg shadow-emerald-900/40">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">Ledger<span className="text-emerald-400">Line</span></h1>
              <p className="text-xs text-slate-400">Provable Double-Entry Money Movement</p>
            </div>
          </div>

          {/* Quick 1-Click Persona Login */}
          <div className="mb-6 bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>One-Click Evaluation Personas</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickSwitch('alice')}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-left p-2.5 rounded-xl transition group"
              >
                <div className="font-bold text-white group-hover:text-emerald-400">Alice (₹5,000)</div>
                <div className="text-[10px] text-slate-400 font-mono">Account Holder</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickSwitch('bob')}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-left p-2.5 rounded-xl transition group"
              >
                <div className="font-bold text-white group-hover:text-emerald-400">Bob (₹2,500)</div>
                <div className="text-[10px] text-slate-400 font-mono">Account Holder</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickSwitch('admin')}
                className="bg-slate-900 hover:bg-slate-800 border border-purple-800/60 text-left p-2.5 rounded-xl transition group"
              >
                <div className="font-bold text-purple-300 group-hover:text-purple-200">System Admin</div>
                <div className="text-[10px] text-slate-400 font-mono">Role: ADMIN</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickSwitch('auditor')}
                className="bg-slate-900 hover:bg-slate-800 border border-emerald-800/60 text-left p-2.5 rounded-xl transition group"
              >
                <div className="font-bold text-emerald-300 group-hover:text-emerald-200">Lead Auditor</div>
                <div className="text-[10px] text-slate-400 font-mono">Proof & Audit Console</div>
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            {loginError && (
              <div className="text-xs text-rose-400 bg-rose-950/40 p-2.5 rounded-lg border border-rose-800/60">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-3 rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-2 transition"
            >
              <span>Sign In to System</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Logged In Shell
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        currentUser={currentUser}
        onSwitchUser={handleQuickSwitch}
        onLogout={handleLogout}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && <Dashboard currentUser={currentUser} />}
        {activeTab === 'auditor' && <AuditorConsole />}
        {activeTab === 'admin' && <AdminConsole onAccountCreated={() => {}} />}
      </main>

      <footer className="border-t border-slate-800/80 py-4 text-center text-xs text-slate-500 font-mono">
        LedgerLine — Zero-Trust Concurrency, Idempotency & Cryptographic Ledger Proof
      </footer>
    </div>
  );
}
export default App;
