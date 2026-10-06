/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Login } from './pages/public/Login';
import { Register } from './pages/public/Register';
import { PendingApproval } from './pages/public/PendingApproval';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { EmergencyRequests } from './pages/admin/EmergencyRequests';
import { AdminRequestDetails } from './pages/admin/AdminRequestDetails';
import { VolunteerApprovals } from './pages/admin/VolunteerApprovals';
import { VolunteerManagement } from './pages/admin/VolunteerManagement';
import { VolunteerDashboard } from './pages/volunteer/VolunteerDashboard';
import { VolunteerRequests } from './pages/volunteer/VolunteerRequests';
import { VolunteerRequestDetails } from './pages/volunteer/VolunteerRequestDetails';
import { NotificationsPage } from './pages/common/NotificationsPage';
import { Profile } from './pages/common/Profile';

const AppContent: React.FC = () => {
  const { currentUser, currentRoute } = useApp();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // 1. Public unauthenticated flows
  if (!currentUser) {
    if (currentRoute === 'register') {
      return <Register />;
    }
    return <Login />;
  }

  // 2. Pending volunteer account flow
  if (currentUser.role === 'volunteer' && (currentUser.status === 'pending' || currentRoute === 'volunteer-pending')) {
    return <PendingApproval />;
  }

  // 3. Authenticated shell with role-based routing
  const renderCurrentView = () => {
    switch (currentRoute) {
      // Police / Admin routes
      case 'admin-dashboard':
        return <AdminDashboard />;
      case 'admin-requests':
        return <EmergencyRequests />;
      case 'admin-request-detail':
        return <AdminRequestDetails />;
      case 'admin-approvals':
        return <VolunteerApprovals />;
      case 'admin-volunteers':
        return <VolunteerManagement />;
      case 'admin-notifications':
        return <NotificationsPage />;
      case 'admin-profile':
        return <Profile />;

      // Volunteer routes
      case 'volunteer-dashboard':
        return <VolunteerDashboard />;
      case 'volunteer-requests':
        return <VolunteerRequests />;
      case 'volunteer-request-detail':
        return <VolunteerRequestDetails />;
      case 'volunteer-notifications':
        return <NotificationsPage />;
      case 'volunteer-profile':
        return <Profile />;

      default:
        // Default to role home
        return currentUser.role === 'police_admin' ? (
          <AdminDashboard />
        ) : (
          <VolunteerDashboard />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9ff] text-[#0b1c30]">
      {/* Fixed Header */}
      <Header
        mobileSidebarOpen={mobileSidebarOpen}
        setMobileSidebarOpen={setMobileSidebarOpen}
      />

      {/* Role-based Sidebar */}
      <Sidebar
        mobileSidebarOpen={mobileSidebarOpen}
        setMobileSidebarOpen={setMobileSidebarOpen}
      />

      {/* Main Page Area */}
      <div className="md:pl-64 pt-16 min-h-screen transition-all">
        <main className="w-full p-4 sm:p-6 lg:p-8 animate-fadeIn">
          {renderCurrentView()}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
