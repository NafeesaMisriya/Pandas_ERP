import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, Lock, X, KeyRound, AlertCircle } from 'lucide-react';

export const AdminLoginModal = () => {
  const { showLoginModal, closeLoginModal, unlockAdmin } = useAuth();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!showLoginModal) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Password / PIN is required');
      return;
    }
    setError('');
    setSubmitting(true);
    const result = await unlockAdmin(password.trim());
    setSubmitting(false);
    if (result.success) {
      setPassword('');
      closeLoginModal();
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-[#111111] text-white border border-[#F5B900]/30 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#F5B900]/10 border border-[#F5B900]/30 flex items-center justify-center text-[#F5B900]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-wide text-white">Admin Access</h3>
              <p className="text-[11px] text-slate-400">Owner Verification Required</p>
            </div>
          </div>
          <button
            onClick={() => {
              setError('');
              setPassword('');
              closeLoginModal();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            Enter your secure Admin password or PIN to unlock all administrative reports, financial modules, and inventory adjustments.
          </p>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Admin Password / PIN
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full bg-[#1c1c1c] text-white border border-white/15 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-hidden focus:border-[#F5B900] focus:ring-1 focus:ring-[#F5B900] placeholder-slate-500 font-mono tracking-widest"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => {
                setError('');
                setPassword('');
                closeLoginModal();
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold bg-[#F5B900] text-[#111111] hover:bg-[#ffc71a] rounded-xl transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              {submitting ? 'Verifying...' : 'Unlock Admin'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminLoginModal;

