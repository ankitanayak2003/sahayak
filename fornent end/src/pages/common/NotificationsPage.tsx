import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const NotificationsPage: React.FC = () => {
  const { currentUser, notifications, markNotificationRead, markAllNotificationsRead, navigate } = useApp();
  const [filterType, setFilterType] = useState<'all' | 'unread'>('all');

  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'police_admin';

  // Role-specific notifications
  const userNotifications = notifications.filter(
    n => n.targetRole === currentUser.role
  );

  const filteredNotifs = userNotifications.filter(n => {
    if (filterType === 'unread') return !n.read;
    return true;
  });

  const unreadCount = userNotifications.filter(n => !n.read).length;

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full text-left">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-[#0051d5] uppercase tracking-wider">
              {isAdmin ? 'Police Command Alert Feed' : 'Field Responder Telemetry'}
            </span>
            <span className="w-1 h-1 rounded-full bg-[#cbd5e1]" />
            <span className="text-xs font-semibold text-[#76777d]">
              {unreadCount} unread
            </span>
          </div>
          <h1 className="text-3xl font-bold text-[#0b1c30] tracking-tight font-display">
            Notifications
          </h1>
          <p className="text-sm text-[#45464d]">
            {isAdmin
              ? 'Real-time emergency escalations, critical calls, and volunteer mobilization pings'
              : 'Direct dispatch alerts, task status transitions, and emergency updates'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllNotificationsRead}
              className="px-3 py-1.5 rounded-lg bg-white border border-[#cbd5e1] text-xs font-semibold text-[#0b1c30] hover:bg-[#eff4ff] transition-colors cursor-pointer"
            >
              Mark all as read
            </button>
          )}

          <div className="flex items-center bg-[#eff4ff] p-1 rounded-lg border border-[#dce9ff]">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 text-xs font-semibold rounded ${
                filterType === 'all' ? 'bg-white text-[#0b1c30] shadow-xs' : 'text-[#76777d]'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterType('unread')}
              className={`px-3 py-1 text-xs font-semibold rounded ${
                filterType === 'unread' ? 'bg-white text-[#0051d5] shadow-xs font-bold' : 'text-[#76777d]'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-xl shadow-xs border border-[#e2e8f0] divide-y divide-[#f1f5f9] overflow-hidden">
        {filteredNotifs.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-[#eff4ff] flex items-center justify-center text-[#0051d5]">
              <span className="material-symbols-outlined text-[24px]">notifications_paused</span>
            </div>
            <span className="text-sm font-bold text-[#0b1c30]">No Notifications Pending</span>
            <p className="text-xs text-[#76777d] max-w-sm">
              Live broadcast messages and dispatch alerts will appear here as incidents and assignments update in real-time.
            </p>
          </div>
        ) : (
          filteredNotifs.map(item => {
            const isCritical = item.type === 'critical';
            const isUrgent = item.type === 'urgent';
            const isSuccess = item.type === 'success';

            return (
              <div
                key={item.id}
                onClick={() => {
                  markNotificationRead(item.id);
                  if (item.link) {
                    if (item.link.includes('approvals')) {
                      navigate('admin-approvals');
                    } else if (item.link.includes('requests')) {
                      navigate(isAdmin ? 'admin-requests' : 'volunteer-requests');
                    }
                  }
                }}
                className={`p-4 md:p-5 flex items-start gap-4 transition-colors cursor-pointer ${
                  !item.read ? 'bg-[#eff4ff]/30 hover:bg-[#eff4ff]/60' : 'hover:bg-[#f8f9ff]'
                }`}
              >
                {/* Type Icon Badge */}
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isCritical
                      ? 'bg-[#ffdad6] text-[#ba1a1a]'
                      : isUrgent
                      ? 'bg-[#ffdad6] text-[#f63a35]'
                      : isSuccess
                      ? 'bg-[#dce9ff] text-[#0051d5]'
                      : 'bg-[#eff4ff] text-[#0051d5]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {isCritical
                      ? 'crisis_alert'
                      : isUrgent
                      ? 'warning'
                      : isSuccess
                      ? 'verified'
                      : 'info'}
                  </span>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#0b1c30]">{item.title}</span>
                      {!item.read && (
                        <span className="w-2 h-2 rounded-full bg-[#0051d5]" />
                      )}
                    </div>
                    <span className="text-[11px] text-[#76777d] font-mono shrink-0">
                      {item.timestamp}
                    </span>
                  </div>

                  <p className="text-xs text-[#45464d] mt-1 leading-relaxed">
                    {item.message}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
