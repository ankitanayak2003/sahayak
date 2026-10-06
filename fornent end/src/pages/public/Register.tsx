import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';

export const Register: React.FC = () => {
  const { registerVolunteer, navigate } = useApp();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [showPassword1, setShowPassword1] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  const handleSendOtp = async () => {
    if (!phone || phone.trim().length < 10) {
      setError('Please enter a valid 10-digit phone number first.');
      return;
    }
    setError(null);
    setSendingOtp(true);
    try {
      const res = await api.generateOtp(phone.trim());
      setOtpSent(true);
      if (res.otp) {
        setOtp(res.otp);
        setOtpNotice(`OTP sent successfully! (Dev Test OTP: ${res.otp})`);
      } else {
        setOtpNotice('OTP sent to your registered mobile number.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate OTP. Please verify phone number.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long as required by CAD policy.');
      return;
    }

    if (!otp || otp.trim().length !== 6) {
      setError('Please request and enter a valid 6-digit OTP.');
      return;
    }

    setLoading(true);

    try {
      const res = await registerVolunteer({
        name: fullName.trim(),
        phone_number: phone.trim(),
        email: email.trim().toLowerCase(),
        password,
        otp: otp.trim(),
      });

      if (!res.success) {
        setError(res.message || 'Volunteer registration failed.');
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please check inputs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9ff] flex flex-col justify-center items-center p-4 py-8">
      <div className="w-full max-w-xl mx-auto flex flex-col items-center">
        {/* Top Trust & Verification Badge */}
        <div className="flex items-center gap-1.5 bg-[#dce9ff] text-[#0b1c30] px-3.5 py-1 rounded-full shadow-xs mb-4">
          <span className="material-symbols-outlined text-[#0051d5] text-[18px]">verified_user</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#0051d5]">
            Civic Emergency Network
          </span>
        </div>

        {/* Main Registration Surface */}
        <div className="w-full bg-white rounded-xl shadow-xl p-6 sm:p-8 flex flex-col border border-[#e2e8f0]/80">
          {/* Header Block */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-[#0b1c30] tracking-tight font-display">
              Volunteer Registration
            </h1>
            <p className="text-sm text-[#45464d] mt-1">
              Join the emergency response network in your locality
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-[#ffdad6] text-[#ba1a1a] text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {otpNotice && (
            <div className="mb-4 p-3 rounded-lg bg-[#dce9ff] text-[#0051d5] text-xs font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">verified</span>
              <span>{otpNotice}</span>
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Full Name */}
            <div className="flex flex-col gap-1 text-left">
              <label className="text-xs font-semibold text-[#0b1c30]" htmlFor="fullName">
                Full Name
              </label>
              <div className="relative flex items-center">
                <input
                  id="fullName"
                  type="text"
                  required
                  placeholder="e.g. Jane Doe"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full bg-[#eff4ff] text-[#0b1c30] text-sm px-3.5 py-2.5 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0051d5] placeholder:text-[#76777d] transition-colors border border-transparent"
                />
                <span className="material-symbols-outlined absolute right-3 text-[#76777d] pointer-events-none text-[18px]">
                  person
                </span>
              </div>
            </div>

            {/* Email Address */}
            <div className="flex flex-col gap-1 text-left">
              <label className="text-xs font-semibold text-[#0b1c30]" htmlFor="email">
                Email Address
              </label>
              <div className="relative flex items-center">
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="e.g. jane.doe@network.org"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-[#eff4ff] text-[#0b1c30] text-sm px-3.5 py-2.5 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0051d5] placeholder:text-[#76777d] transition-colors border border-transparent"
                />
                <span className="material-symbols-outlined absolute right-3 text-[#76777d] pointer-events-none text-[18px]">
                  mail
                </span>
              </div>
            </div>

            {/* Phone Number & OTP Generation */}
            <div className="flex flex-col gap-1 text-left">
              <label className="text-xs font-semibold text-[#0b1c30]" htmlFor="phone">
                Phone Number (Required for SMS Verification)
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex items-center flex-1">
                  <input
                    id="phone"
                    type="tel"
                    required
                    placeholder="e.g. 9845100234"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full bg-[#eff4ff] text-[#0b1c30] text-sm px-3.5 py-2.5 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0051d5] placeholder:text-[#76777d] transition-colors border border-transparent"
                  />
                  <span className="material-symbols-outlined absolute right-3 text-[#76777d] pointer-events-none text-[18px]">
                    phone
                  </span>
                </div>
                <button
                  type="button"
                  disabled={sendingOtp}
                  onClick={handleSendOtp}
                  className="px-3.5 py-2.5 rounded-lg bg-[#0051d5] text-white text-xs font-bold whitespace-nowrap hover:bg-[#003ea8] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {sendingOtp ? 'Sending...' : otpSent ? 'Resend OTP' : 'Send OTP'}
                </button>
              </div>
            </div>

            {/* OTP Field */}
            <div className="flex flex-col gap-1 text-left">
              <label className="text-xs font-semibold text-[#0b1c30] flex items-center justify-between" htmlFor="otp">
                <span>6-Digit Verification Code (OTP)</span>
                <span className="text-[10px] text-[#76777d]">Required by Security Rules</span>
              </label>
              <div className="relative flex items-center">
                <input
                  id="otp"
                  type="text"
                  required
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                  className="w-full bg-[#eff4ff] text-[#0b1c30] text-sm px-3.5 py-2.5 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0051d5] font-mono tracking-widest placeholder:tracking-normal placeholder:font-sans placeholder:text-[#76777d] transition-colors border border-transparent"
                />
                <span className="material-symbols-outlined absolute right-3 text-[#76777d] pointer-events-none text-[18px]">
                  pin
                </span>
              </div>
            </div>

            {/* Password & Confirm Password Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
              {/* Password */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#0b1c30]" htmlFor="password">
                  Password (min. 8 characters)
                </label>
                <div className="relative flex items-center">
                  <input
                    id="password"
                    type={showPassword1 ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="Create password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-[#eff4ff] text-[#0b1c30] text-sm px-3.5 py-2.5 pr-9 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0051d5] placeholder:text-[#76777d] transition-colors border border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword1(!showPassword1)}
                    className="absolute right-2.5 p-1 text-[#76777d] hover:text-[#0b1c30]"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showPassword1 ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[#0b1c30]" htmlFor="confirmPassword">
                  Confirm Password
                </label>
                <div className="relative flex items-center">
                  <input
                    id="confirmPassword"
                    type={showPassword2 ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full bg-[#eff4ff] text-[#0b1c30] text-sm px-3.5 py-2.5 pr-9 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0051d5] placeholder:text-[#76777d] transition-colors border border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword2(!showPassword2)}
                    className="absolute right-2.5 p-1 text-[#76777d] hover:text-[#0b1c30]"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showPassword2 ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Privacy & Commitment Notice */}
            <div className="flex items-start gap-2.5 p-3 bg-[#eff4ff] rounded-lg mt-1 text-left">
              <span className="material-symbols-outlined text-[#0051d5] text-[18px] shrink-0 mt-0.5">
                volunteer_activism
              </span>
              <p className="text-xs text-[#45464d] leading-relaxed">
                By registering, you commit to assisting during local civil support, medical triage, or regional disaster mobilization in your designated zone.
              </p>
            </div>

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[#000000] text-white text-xs font-bold tracking-wider uppercase rounded-lg shadow-md hover:bg-[#213145] active:scale-[0.99] transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer disabled:opacity-75"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                  <span>Registering with Sahayak CAD...</span>
                </>
              ) : (
                <>
                  <span>REGISTER AS VOLUNTEER</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {/* Footer Navigation */}
          <div className="mt-5 pt-3 border-t border-[#f1f5f9] text-center flex items-center justify-center gap-1.5 text-xs">
            <span className="text-[#45464d]">Already have an account?</span>
            <button
              type="button"
              onClick={() => navigate('login')}
              className="font-bold text-[#0051d5] hover:underline cursor-pointer"
            >
              Login
            </button>
          </div>
        </div>

        {/* Secondary Context Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-[#76777d] text-[11px]">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">lock</span>
            256-bit encrypted
          </span>
          <span>•</span>
          <span>Civic Dispatch Protocol</span>
          <span>•</span>
          <span>Direct Dispatch Link</span>
        </div>
      </div>
    </div>
  );
};
