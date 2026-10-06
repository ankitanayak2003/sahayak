import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Logo } from './Logo';

interface HeaderProps {
  mobileSidebarOpen?: boolean;
  setMobileSidebarOpen?: (open: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ mobileSidebarOpen, setMobileSidebarOpen }) => {
  const { currentUser, navigate, logout, notifications, markNotificationRead } = useApp();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'police_admin';
  const roleSubtitle = isAdmin ? 'Emergency Dispatch' : 'Field Responder';
  const roleBadgeText = isAdmin ? 'POLICE COMMAND' : 'VOLUNTEER';

  // Filter notifications for current user
  const userNotifications = notifications.filter(
    n => n.targetRole === currentUser.role
  );
  const unreadCount = userNotifications.filter(n => !n.read).length;

  return (
    <header className="fixed top-0 left-0 right-0 h-16 z-50 bg-white border-b border-[#e5eeff] shadow-[0_1px_8px_rgba(0,0,0,0.04)] select-none">
      <div className="h-16 w-full px-4 md:px-8 flex items-center justify-between">
        {/* Left: Mobile Toggle & Brand */}
        <div className="flex items-center gap-3">
          {setMobileSidebarOpen && (
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              className="md:hidden p-1.5 rounded-lg text-[#45464d] hover:bg-[#eff4ff] hover:text-[#0b1c30] cursor-pointer"
              title="Toggle Menu"
            >
              <span className="material-symbols-outlined text-[24px]">
                {mobileSidebarOpen ? 'close' : 'menu'}
              </span>
            </button>
          )}

          <div
            className="cursor-pointer"
            onClick={() => navigate(isAdmin ? 'admin-dashboard' : 'volunteer-dashboard')}
          >
            <Logo subtitle={roleSubtitle} size="md" />
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          {/* Role Badge */}
          <span
            className={`hidden sm:inline-flex items-center px-2.5 py-1 rounded text-xs font-bold tracking-wider uppercase ${
              isAdmin
                ? 'bg-[#dce9ff] text-[#0051d5]'
                : 'bg-[#e5eeff] text-[#45464d]'
            }`}
          >
            {roleBadgeText}
          </span>

          {/* Notifications Bell */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#eff4ff] text-[#45464d] hover:text-[#0b1c30] transition-colors relative cursor-pointer"
              title="Notifications"
            >
              <span className="material-symbols-outlined text-[22px]">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#ba1a1a] text-white text-[10px] flex items-center justify-center font-bold">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Popover */}
            {notifDropdownOpen && (
              <div className="absolute right-0 mt-2 w-80 md:w-96 bg-white rounded-xl shadow-xl border border-[#e2e8f0] py-2 z-50 overflow-hidden">
                <div className="px-4 py-2 border-b border-[#f1f5f9] flex items-center justify-between bg-[#f8f9ff]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-[#0b1c30]">Notifications</span>
                    <span className="text-[11px] bg-[#eff4ff] text-[#0051d5] font-bold px-2 py-0.5 rounded-full">
                      {unreadCount} new
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      navigate(isAdmin ? 'admin-notifications' : 'volunteer-notifications');
                      setNotifDropdownOpen(false);
                    }}
                    className="text-xs text-[#0051d5] hover:underline font-medium"
                  >
                    View All
                  </button>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-[#f1f5f9]">
                  {userNotifications.length === 0 ? (
                    <div className="p-4 text-center text-xs text-[#76777d]">
                      No notifications at this time.
                    </div>
                  ) : (
                    userNotifications.slice(0, 4).map(item => (
                      <div
                        key={item.id}
                        onClick={() => {
                          markNotificationRead(item.id);
                          navigate(isAdmin ? 'admin-notifications' : 'volunteer-notifications');
                          setNotifDropdownOpen(false);
                        }}
                        className={`p-3.5 hover:bg-[#f8f9ff] cursor-pointer transition-colors flex items-start gap-3 ${
                          !item.read ? 'bg-[#eff4ff]/40' : ''
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            item.type === 'critical'
                              ? 'bg-[#ffdad6] text-[#ba1a1a]'
                              : item.type === 'urgent'
                              ? 'bg-[#ffdad6] text-[#f63a35]'
                              : item.type === 'success'
                              ? 'bg-[#dbe1ff] text-[#0051d5]'
                              : 'bg-[#eff4ff] text-[#0051d5]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            {item.type === 'critical' ? 'priority_high' : item.type === 'urgent' ? 'warning' : 'info'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-[#0b1c30] truncate">
                              {item.title}
                            </span>
                            <span className="text-[10px] text-[#76777d] ml-1 shrink-0">
                              {item.timestamp}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#45464d] mt-0.5 line-clamp-2">
                            {item.message}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-2 border-t border-[#f1f5f9] text-center bg-[#f8f9ff]">
                  <button
                    onClick={() => {
                      navigate(isAdmin ? 'admin-notifications' : 'volunteer-notifications');
                      setNotifDropdownOpen(false);
                    }}
                    className="text-xs text-[#0051d5] font-semibold hover:text-[#003ea8]"
                  >
                    Open Notification Center →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Menu */}
          <div className="relative" ref={dropdownRef}>
            <div
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="flex items-center gap-2.5 cursor-pointer py-1 px-2 rounded-lg hover:bg-[#eff4ff] transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-[#000000] text-white flex items-center justify-center font-bold text-xs">
                {currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
              </div>
              <div className="hidden md:flex flex-col text-left leading-tight">
                <span className="text-xs font-semibold text-[#0b1c30]">{currentUser.name}</span>
                <span className="text-[10px] text-[#76777d]">{currentUser.departmentOrDivision}</span>
              </div>
              <span className="material-symbols-outlined text-[#76777d] text-[18px]">
                expand_more
              </span>
            </div>

            {/* Profile Dropdown */}
            {profileDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-[#e2e8f0] py-2 z-50">
                <div className="px-4 py-2 border-b border-[#f1f5f9] text-left">
                  <p className="text-[10px] text-[#76777d] uppercase font-bold tracking-wider">Signed in as</p>
                  <p className="text-sm font-bold text-[#0b1c30] truncate">{currentUser.name}</p>
                  <p className="text-xs text-[#45464d] truncate">{currentUser.email}</p>
                  <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-[#eff4ff] text-[#0051d5]">
                    {currentUser.badgeOrId}
                  </span>
                </div>

                <div className="py-1 text-left">
                  <button
                    type="button"
                    onClick={() => {
                      navigate(isAdmin ? 'admin-profile' : 'volunteer-profile');
                      setProfileDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-xs text-[#0b1c30] hover:bg-[#eff4ff] flex items-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#76777d]">account_circle</span>
                    <span>View Profile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setProfileDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-xs text-[#ba1a1a] hover:bg-[#ffdad6] flex items-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">logout</span>
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
