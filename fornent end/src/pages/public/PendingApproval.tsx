import React from 'react';
import { useApp } from '../../context/AppContext';

export const PendingApproval: React.FC = () => {
  const { currentUser, logout } = useApp();

  const applicantName = currentUser?.name || 'Volunteer Applicant';
  const applicantEmail = currentUser?.email || 'applicant@sahayak.org';
  const applicantPhone = currentUser?.phone || 'Provided during registration';
  const ticketId = currentUser?.badgeOrId || 'SAH-PENDING';

  return (
    <div className="min-h-screen bg-[#f8f9ff] flex flex-col justify-center items-center p-4">
      <div className="relative w-full max-w-xl bg-white rounded-xl shadow-xl overflow-hidden border border-[#e2e8f0]/80">
        {/* Top Accent Strip */}
        <div className="h-2 w-full bg-[#0051d5]" />

        <div className="p-6 sm:p-10 flex flex-col items-center text-center">
          {/* Animated Hourglass Graphic */}
          <div className="relative mb-5 flex items-center justify-center">
            <div className="w-18 h-18 rounded-full bg-[#dce9ff] flex items-center justify-center text-[#0051d5] relative z-10 shadow-sm">
              <span className="material-symbols-outlined text-4xl animate-pulse">
                hourglass_top
              </span>
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-xs z-20 border border-[#e2e8f0]">
              <span className="material-symbols-outlined text-[#0051d5] text-sm">
                verified_user
              </span>
            </div>
            <div className="absolute inset-0 rounded-full bg-[#dbe1ff] opacity-60 scale-125 blur-sm" />
          </div>

          {/* Civic Status Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eff4ff] text-[#0051d5] mb-3">
            <span className="w-2 h-2 rounded-full bg-[#0051d5] animate-ping" />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              CIVIC ACCESS STATUS • STAGE 01
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-[#0b1c30] tracking-tight mb-1 font-display">
            Registration Successful
          </h1>
          <p className="text-lg font-semibold text-[#0051d5] mb-3">
            Your account is pending approval.
          </p>
          <p className="text-sm text-[#45464d] max-w-md leading-relaxed mb-6">
            A Police/Admin authority must approve your volunteer account before you can receive emergency assignments. You will receive an automated dispatch notification once authorized.
          </p>

          {/* Verification Summary Card */}
          <div className="w-full bg-[#eff4ff] rounded-lg p-4 sm:p-5 text-left mb-6 border border-[#dce9ff]">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#dce9ff]">
              <span className="text-[11px] font-bold text-[#45464d] uppercase tracking-wider">
                Verification Summary
              </span>
              <span className="text-[10px] font-mono bg-[#d3e4fe] px-2 py-0.5 rounded text-[#0b1c30] font-bold">
                {ticketId}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-[#45464d] uppercase block">Applicant Name</span>
                <span className="text-sm text-[#0b1c30] font-semibold block">{applicantName}</span>
              </div>
              <div>
                <span className="text-[11px] text-[#45464d] uppercase block">Registered Email</span>
                <span className="text-sm text-[#0b1c30] font-semibold block truncate">{applicantEmail}</span>
              </div>
              <div>
                <span className="text-[11px] text-[#45464d] uppercase block">Contact Phone</span>
                <span className="text-sm text-[#0b1c30] font-semibold block">{applicantPhone}</span>
              </div>
              <div>
                <span className="text-[11px] text-[#45464d] uppercase block">Submission Status</span>
                <span className="text-sm text-[#0051d5] font-semibold block">Pending Admin Verification</span>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-[#dce9ff] flex items-center justify-between text-[#45464d] text-xs">
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-[#0051d5]">shield</span>
                <span className="text-[11px]">Authorized Civic Protocol 10-A</span>
              </div>
              <span className="text-[11px] text-[#0051d5] font-semibold">Queue Priority: Standard</span>
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
            <button
              type="button"
              onClick={logout}
              className="w-full sm:w-auto min-w-[200px] h-10 px-6 rounded-lg bg-[#0f172a] hover:bg-[#1e293b] text-white font-semibold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 active:scale-95 shadow-xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">logout</span>
              <span>LOG OUT</span>
            </button>
          </div>

          <div className="mt-5 flex items-center gap-1.5 text-[#45464d] text-xs">
            <span className="material-symbols-outlined text-sm">support_agent</span>
            <span>Need immediate clearance? Contact Metro Regional Control (Ext. 402)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
