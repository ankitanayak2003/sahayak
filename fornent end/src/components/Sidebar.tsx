import React from 'react';
import { useApp } from '../context/AppContext';

interface SidebarProps {
  mobileSidebarOpen?: boolean;
  setMobileSidebarOpen?: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileSidebarOpen, setMobileSidebarOpen }) => {
  const { currentUser, currentRoute, navigate, logout, notifications, volunteers } = useApp();

  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'police_admin';

  // Badge counts
  const pendingApprovalsCount = volunteers.filter(v => v.accountStatus === 'pending').length;
  const unreadNotifCount = notifications.filter(
    n => n.targetRole === currentUser.role && !n.read
  ).length;

  const handleNav = (route: string) => {
    navigate(route);
    if (setMobileSidebarOpen) {
      setMobileSidebarOpen(false);
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen && setMobileSidebarOpen(false)}
          className="fixed inset-0 bg-black/40 z-35 md:hidden backdrop-blur-2xs"
        />
      )}

      <aside
        className={`fixed left-0 top-16 bottom-0 w-64 bg-white border-r border-[#e5eeff] shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 flex flex-col justify-between py-6 select-none transition-transform duration-200 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="px-4">
          {/* Section Title */}
          <div className="px-3 mb-4 text-left">
            <span className="text-[11px] font-bold text-[#76777d] uppercase tracking-wider">
              {isAdmin ? 'Admin Console' : 'Volunteer Portal'}
            </span>
          </div>

          {/* Navigation Items strictly following blueprint */}
          <nav className="flex flex-col gap-1">
            {isAdmin ? (
              <>
                {/* Dashboard */}
                <button
                  type="button"
                  onClick={() => handleNav('admin-dashboard')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm transition-all text-left cursor-pointer ${
                    currentRoute === 'admin-dashboard'
                      ? 'bg-[#e5eeff] text-[#0051d5] font-semibold shadow-xs'
                      : 'text-[#45464d] hover:bg-[#eff4ff] hover:text-[#0b1c30]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px]">dashboard</span>
                    <span>Dashboard</span>
                  </div>
                </button>

                {/* Emergency Requests */}
                <button
                  type="button"
                  onClick={() => handleNav('admin-requests')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm transition-all text-left cursor-pointer ${
                    currentRoute === 'admin-requests' || currentRoute === 'admin-request-detail'
                      ? 'bg-[#e5eeff] text-[#0051d5] font-semibold shadow-xs'
                      : 'text-[#45464d] hover:bg-[#eff4ff] hover:text-[#0b1c30]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px]">emergency</span>
                    <span>Emergency Requests</span>
                  </div>
                </button>

                {/* Volunteer Approvals */}
                <button
                  type="button"
                  onClick={() => handleNav('admin-approvals')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm transition-all text-left cursor-pointer ${
                    currentRoute === 'admin-approvals'
                      ? 'bg-[#e5eeff] text-[#0051d5] font-semibold shadow-xs'
                      : 'text-[#45464d] hover:bg-[#eff4ff] hover:text-[#0b1c30]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px]">how_to_reg</span>
                    <span>Volunteer Approvals</span>
                  </div>
                  {pendingApprovalsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ffdad6] text-[#ba1a1a]">
                      {pendingApprovalsCount}
                    </span>
                  )}
                </button>

                {/* Volunteer Management */}
                <button
                  type="button"
                  onClick={() => handleNav('admin-volunteers')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm transition-all text-left cursor-pointer ${
                    currentRoute === 'admin-volunteers'
                      ? 'bg-[#e5eeff] text-[#0051d5] font-semibold shadow-xs'
                      : 'text-[#45464d] hover:bg-[#eff4ff] hover:text-[#0b1c30]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px]">group</span>
                    <span>Volunteer Management</span>
                  </div>
                </button>

                {/* Notifications */}
                <button
                  type="button"
                  onClick={() => handleNav('admin-notifications')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm transition-all text-left cursor-pointer ${
                    currentRoute === 'admin-notifications'
                      ? 'bg-[#e5eeff] text-[#0051d5] font-semibold shadow-xs'
                      : 'text-[#45464d] hover:bg-[#eff4ff] hover:text-[#0b1c30]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px]">notifications</span>
                    <span>Notifications</span>
                  </div>
                  {unreadNotifCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#0051d5] text-white">
                      {unreadNotifCount}
                    </span>
                  )}
                </button>

                {/* Profile */}
                <button
                  type="button"
                  onClick={() => handleNav('admin-profile')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm transition-all text-left cursor-pointer ${
                    currentRoute === 'admin-profile'
                      ? 'bg-[#e5eeff] text-[#0051d5] font-semibold shadow-xs'
                      : 'text-[#45464d] hover:bg-[#eff4ff] hover:text-[#0b1c30]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px]">account_circle</span>
                    <span>Profile</span>
                  </div>
                </button>
              </>
            ) : (
              <>
                {/* Volunteer Navigation */}
                {/* Dashboard */}
                <button
                  type="button"
                  onClick={() => handleNav('volunteer-dashboard')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm transition-all text-left cursor-pointer ${
                    currentRoute === 'volunteer-dashboard'
                      ? 'bg-[#e5eeff] text-[#0051d5] font-semibold shadow-xs'
                      : 'text-[#45464d] hover:bg-[#eff4ff] hover:text-[#0b1c30]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px]">dashboard</span>
                    <span>Dashboard</span>
                  </div>
                </button>

                {/* My Requests */}
                <button
                  type="button"
                  onClick={() => handleNav('volunteer-requests')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm transition-all text-left cursor-pointer ${
                    currentRoute === 'volunteer-requests' || currentRoute === 'volunteer-request-detail'
                      ? 'bg-[#e5eeff] text-[#0051d5] font-semibold shadow-xs'
                      : 'text-[#45464d] hover:bg-[#eff4ff] hover:text-[#0b1c30]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px]">assignment</span>
                    <span>My Requests</span>
                  </div>
                </button>

                {/* Notifications */}
                <button
                  type="button"
                  onClick={() => handleNav('volunteer-notifications')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm transition-all text-left cursor-pointer ${
                    currentRoute === 'volunteer-notifications'
                      ? 'bg-[#e5eeff] text-[#0051d5] font-semibold shadow-xs'
                      : 'text-[#45464d] hover:bg-[#eff4ff] hover:text-[#0b1c30]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px]">notifications</span>
                    <span>Notifications</span>
                  </div>
                  {unreadNotifCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#0051d5] text-white">
                      {unreadNotifCount}
                    </span>
                  )}
                </button>

                {/* Profile */}
                <button
                  type="button"
                  onClick={() => handleNav('volunteer-profile')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm transition-all text-left cursor-pointer ${
                    currentRoute === 'volunteer-profile'
                      ? 'bg-[#e5eeff] text-[#0051d5] font-semibold shadow-xs'
                      : 'text-[#45464d] hover:bg-[#eff4ff] hover:text-[#0b1c30]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px]">account_circle</span>
                    <span>Profile</span>
                  </div>
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Logout button at bottom */}
        <div className="px-4 pt-4 border-t border-[#f1f5f9]">
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-semibold text-[#ba1a1a] hover:bg-[#ffdad6] hover:text-[#93000a] transition-all text-left cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
};
