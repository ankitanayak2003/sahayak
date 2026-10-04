import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Logo } from '../../components/Logo';
import { CitizenEmergencyModal } from '../../components/CitizenEmergencyModal';

export const Login: React.FC = () => {
  const { login, navigate } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await login(email, password);
      if (!res.success) {
        setError(res.message || 'Invalid email or password.');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9ff] flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Subtle ambient backdrops */}
      <div className="absolute -top-32 -left-20 w-96 h-96 rounded-full bg-[#d3e4fe]/40 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-28 -right-20 w-96 h-96 rounded-full bg-[#dbe1ff]/30 blur-3xl pointer-events-none" />

      {/* Main Login Card */}
      <div className="relative w-full max-w-[460px] bg-white shadow-xl rounded-xl p-6 md:p-8 flex flex-col z-10 border border-[#e2e8f0]/80">
        {/* Emblem & Title */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-4">
            <Logo size="lg" subtitle="Emergency Assistance" />
          </div>
          <p className="text-sm font-bold text-[#0051d5] tracking-wider uppercase font-display">
            Emergency Assistance System
          </p>
          <div className="flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-[#eff4ff] text-[#45464d]">
            <span className="w-2 h-2 rounded-full bg-[#0051d5] animate-pulse" />
            <span className="text-[11px] tracking-wider uppercase font-semibold text-[#0051d5]">
              Live Operational Gateway
            </span>
          </div>
        </div>

        {/* Emergency SOS Banner for Citizens */}
        <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-[#ba1a1a] to-[#de3730] text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5 text-left">
            <span className="material-symbols-outlined text-[24px] animate-pulse">crisis_alert</span>
            <div>
              <span className="text-xs font-bold block leading-tight">Need Urgent Help?</span>
              <span className="text-[10px] text-white/90">Share GPS & alert responders</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowEmergencyModal(true)}
            className="px-3 py-1.5 rounded-lg bg-white text-[#ba1a1a] hover:bg-[#ffdad6] font-bold text-xs uppercase tracking-wider transition-colors shadow-xs cursor-pointer"
          >
            SOS Help
          </button>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          {error && (
            <div className="p-3 rounded-lg bg-[#ffdad6] text-[#ba1a1a] text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* Email / ID Field */}
          <div className="flex flex-col gap-1 text-left">
            <label className="text-xs font-semibold text-[#0b1c30] flex items-center justify-between" htmlFor="identity-email">
              <span>Official ID / Volunteer Email</span>
              <span className="text-[10px] text-[#76777d] font-normal">Encrypted</span>
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-[#76777d] select-none pointer-events-none text-[18px]">
                badge
              </span>
              <input
                id="identity-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@department.gov.in or volunteer email"
                required
                className="w-full bg-[#eff4ff] text-[#0b1c30] placeholder:text-[#76777d]/70 text-sm pl-10 pr-3 py-2.5 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0051d5] transition-all border border-transparent focus:border-transparent"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="flex flex-col gap-1 text-left">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#0b1c30]" htmlFor="account-password">
                Password
              </label>
            </div>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-[#76777d] select-none pointer-events-none text-[18px]">
                lock
              </span>
              <input
                id="account-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter secure credentials"
                required
                className="w-full bg-[#eff4ff] text-[#0b1c30] placeholder:text-[#76777d]/70 text-sm pl-10 pr-10 py-2.5 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0051d5] transition-all border border-transparent focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 p-1 text-[#76777d] hover:text-[#0b1c30] focus:outline-none transition-colors"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-lg bg-[#0f172a] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#1e293b] active:scale-[0.99] transition-all shadow-md cursor-pointer disabled:opacity-70 mt-1"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                <span>Authenticating with Backend CAD...</span>
              </>
            ) : (
              <>
                <span>LOGIN</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        {/* Public Registration Link */}
        <div className="mt-5 pt-3 border-t border-[#f1f5f9] flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('register')}
            className="text-xs font-semibold text-[#0051d5] hover:text-[#003ea8] flex items-center gap-1 group transition-colors cursor-pointer"
          >
            <span>Register as Volunteer</span>
            <span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">
              person_add
            </span>
          </button>

          <div className="w-full p-2.5 rounded-lg bg-[#eff4ff]/70 flex items-start gap-2 text-left">
            <span className="material-symbols-outlined text-[#76777d] text-[16px] mt-0.5 shrink-0">
              shield
            </span>
            <p className="text-[11px] text-[#45464d] leading-relaxed">
              Access restricted to authorized personnel and verified volunteers. Role returned deterministically by backend.
            </p>
          </div>
        </div>
      </div>

      {/* SSL Footer Strip */}
      <div className="mt-6 flex items-center gap-4 text-[#76777d] text-xs">
        <div className="flex items-center gap-1">
          <span className="material-symbols-outlined text-[15px]">verified_user</span>
          <span>256-Bit SSL Secured</span>
        </div>
        <span className="w-1 h-1 rounded-full bg-[#cbd5e1]" />
        <div className="flex items-center gap-1">
          <span className="material-symbols-outlined text-[15px]">dns</span>
          <span>Sahayak CAD Gateway</span>
        </div>
      </div>

      {/* Citizen Emergency Modal */}
      <CitizenEmergencyModal
        isOpen={showEmergencyModal}
        onClose={() => setShowEmergencyModal(false)}
      />
    </div>
  );
};
