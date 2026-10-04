import React from 'react';
import { useApp } from '../../context/AppContext';

export const Profile: React.FC = () => {
  const { currentUser, logout } = useApp();

  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'police_admin';

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full text-left">
      <div>
        <h1 className="text-3xl font-bold text-[#0b1c30] tracking-tight font-display">
          Profile
        </h1>
        <p className="text-sm text-[#45464d] mt-1">
          Authorized personnel identity and operational station credentials
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] overflow-hidden">
        {/* Banner with avatar */}
        <div className="bg-[#eff4ff] p-6 border-b border-[#dce9ff] flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#000000] text-white flex items-center justify-center font-bold text-xl shadow-sm">
            {currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#0b1c30] font-display">{currentUser.name}</h2>
            <p className="text-xs text-[#45464d]">{currentUser.departmentOrDivision}</p>
            <span className="inline-block mt-1.5 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white text-[#0051d5] border border-[#dce9ff]">
              ID / BADGE: {currentUser.badgeOrId}
            </span>
          </div>
        </div>

        {/* Displayed Read-Only Fields strictly adhering to Blueprint */}
        <div className="p-6 divide-y divide-[#f1f5f9] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-1 gap-1">
            <span className="text-xs font-bold text-[#76777d] uppercase tracking-wider">
              Name
            </span>
            <span className="text-sm font-semibold text-[#0b1c30]">{currentUser.name}</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 gap-1">
            <span className="text-xs font-bold text-[#76777d] uppercase tracking-wider">
              Email
            </span>
            <span className="text-sm font-semibold text-[#0b1c30]">{currentUser.email}</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 gap-1">
            <span className="text-xs font-bold text-[#76777d] uppercase tracking-wider">
              Phone
            </span>
            <span className="text-sm font-semibold text-[#0b1c30]">{currentUser.phone}</span>
          </div>

          {/* Role displayed, NOT editable as required by blueprint */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 gap-1">
            <span className="text-xs font-bold text-[#76777d] uppercase tracking-wider">
              Role
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                isAdmin ? 'bg-[#dce9ff] text-[#0051d5]' : 'bg-[#e5eeff] text-[#0b1c30]'
              }`}
            >
              {isAdmin ? 'Police / Admin Commander' : 'Volunteer Field Responder'}
            </span>
          </div>

          {/* Account Status */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 gap-1">
            <span className="text-xs font-bold text-[#76777d] uppercase tracking-wider">
              Account Status
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-[#dbe1ff] text-[#0051d5]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0051d5]" />
              {currentUser.status}
            </span>
          </div>

          {currentUser.certification && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 gap-1">
              <span className="text-xs font-bold text-[#76777d] uppercase tracking-wider">
                Certification
              </span>
              <span className="text-sm text-[#0051d5] font-semibold">{currentUser.certification}</span>
            </div>
          )}
        </div>

        {/* Security / Audit Note */}
        <div className="px-6 py-3 bg-[#f8f9ff] border-t border-[#f1f5f9] text-[11px] text-[#76777d] flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-[#0051d5]">lock</span>
          <span>Role and credential parameters are managed by Node CAD server security policies.</span>
        </div>

        {/* Action Button: [ Logout ] strictly adhering to Blueprint */}
        <div className="p-6 bg-white border-t border-[#f1f5f9] flex justify-end">
          <button
            type="button"
            onClick={logout}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-[#ba1a1a] hover:bg-[#93000a] text-white text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
};
