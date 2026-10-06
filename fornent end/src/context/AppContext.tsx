import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, EmergencyRequest, VolunteerMember, AppNotification, IncidentStatus } from '../types';
import {
  api,
  getAccessToken,
  getStoredUser,
  setStoredUser,
  clearAuthTokens,
  mapBackendRequestToFrontend,
  mapBackendVolunteerToFrontend,
  mapStatusToBackend,
} from '../services/api';

export interface AppContextType {
  currentUser: User | null;
  currentRoute: string;
  activeRequestId: string;
  requests: EmergencyRequest[];
  volunteers: VolunteerMember[];
  availableVolunteers: VolunteerMember[];
  pendingVolunteers: VolunteerMember[];
  notifications: AppNotification[];
  onDuty: boolean;
  dutyLoading: boolean;
  loading: boolean;
  error: string | null;
  setOnDuty: React.Dispatch<React.SetStateAction<boolean>>;
  login: (email: string, pass: string) => Promise<{ success: boolean; message?: string }>;
  registerVolunteer: (data: {
    name: string;
    phone_number: string;
    email: string;
    password: string;
    otp: string;
  }) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  navigate: (route: string, requestId?: string) => void;
  updateRequestStatus: (requestId: string, status: IncidentStatus) => Promise<void>;
  assignVolunteerToRequest: (requestId: string, volunteerId: string, volunteerName: string) => Promise<void>;
  autoAssignVolunteerToRequest: (requestId: string) => Promise<{ success: boolean; message?: string }>;
  acceptAssignedRequest: (requestId: string) => Promise<void>;
  rejectAssignedRequest: (requestId: string, reason?: string) => Promise<void>;
  toggleDuty: (targetDuty?: boolean) => Promise<void>;
  refreshRequests: () => Promise<void>;
  refreshVolunteers: () => Promise<void>;
  fetchRequestDetails: (requestId: string) => Promise<EmergencyRequest | null>;
  escalateRequest: (requestId: string, department: string, notes?: string) => Promise<void>;
  approveVolunteer: (volunteerId: string) => Promise<void>;
  rejectVolunteer: (volunteerId: string) => Promise<void>;
  markNotificationRead: (notifId: string) => void;
  markAllNotificationsRead: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load session from stored user only if valid access token exists
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const token = getAccessToken();
    if (!token) return null;
    return getStoredUser();
  });

  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    const token = getAccessToken();
    if (!token) return 'login';
    const user = getStoredUser();
    if (user?.role === 'police_admin') return 'admin-dashboard';
    if (user?.role === 'volunteer') {
      return user.status === 'pending' ? 'volunteer-pending' : 'volunteer-dashboard';
    }
    return 'login';
  });

  const [activeRequestId, setActiveRequestId] = useState<string>('');
  const [requests, setRequests] = useState<EmergencyRequest[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerMember[]>([]);
  const [availableVolunteers, setAvailableVolunteers] = useState<VolunteerMember[]>([]);
  const [pendingVolunteers, setPendingVolunteers] = useState<VolunteerMember[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [onDuty, setOnDuty] = useState<boolean>(false);
  const [dutyLoading, setDutyLoading] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for session expiry event from API client
  useEffect(() => {
    const handleSessionExpired = () => {
      setCurrentUser(null);
      setStoredUser(null);
      setCurrentRoute('login');
      setRequests([]);
      setVolunteers([]);
      setAvailableVolunteers([]);
      setPendingVolunteers([]);
    };

    window.addEventListener('sahayak:session_expired', handleSessionExpired);
    return () => window.removeEventListener('sahayak:session_expired', handleSessionExpired);
  }, []);

  // Refresh live requests from backend API
  const refreshRequests = useCallback(async () => {
    if (!getAccessToken()) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.getRequests({ limit: 100 });
      if (res && res.requests && Array.isArray(res.requests)) {
        const liveMapped = res.requests.map(r => mapBackendRequestToFrontend(r));
        setRequests(liveMapped);
        if (liveMapped.length > 0 && !activeRequestId) {
          setActiveRequestId(liveMapped[0].id);
        }
      } else {
        setRequests([]);
      }
    } catch (err: any) {
      console.warn('Backend requests query notice:', err);
      setError(err.message || 'Unable to retrieve requests from server');
    } finally {
      setLoading(false);
    }
  }, [activeRequestId]);

  // Refresh live volunteers from backend API
  const refreshVolunteers = useCallback(async () => {
    if (!getAccessToken()) return;
    try {
      // If Police Admin: fetch verified roster, available pool, and pending queues
      if (currentUser?.role === 'police_admin') {
        const [verifiedRes, availRes, pendRes] = await Promise.allSettled([
          api.getVerifiedVolunteers(1, 50),
          api.getAvailableVolunteers(1, 50),
          api.getPendingVolunteers(1, 50),
        ]);

        if (verifiedRes.status === 'fulfilled' && verifiedRes.value?.volunteers) {
          const liveVerified = verifiedRes.value.volunteers.map(v => mapBackendVolunteerToFrontend(v));
          setVolunteers(liveVerified);
        } else if (availRes.status === 'fulfilled' && availRes.value?.volunteers) {
          const liveAvail = availRes.value.volunteers.map(v => mapBackendVolunteerToFrontend(v));
          setVolunteers(liveAvail);
        }

        if (availRes.status === 'fulfilled' && availRes.value?.volunteers) {
          const liveAvail = availRes.value.volunteers.map(v => mapBackendVolunteerToFrontend(v));
          setAvailableVolunteers(liveAvail);
        }

        if (pendRes.status === 'fulfilled' && pendRes.value?.volunteers) {
          const livePend = pendRes.value.volunteers.map(v => ({
            id: String(v.volunteerId),
            name: v.name || `Applicant ${String(v.volunteerId).slice(-4)}`,
            email: v.email || `applicant.${String(v.volunteerId).slice(-4)}@sahayak.org`,
            phone: v.phoneNumber || '+91 98450 11022',
            status: 'Inactive' as const,
            accountStatus: 'pending' as const,
            activeAssignments: 0,
            assignmentText: '—',
            roleDescription: 'Civic Emergency First Responder Applicant',
            certification: 'Pending Police Verification',
            rating: 0,
            completedResponses: 0,
            submittedAt: v.createdAt ? new Date(v.createdAt).toLocaleDateString() : 'Active',
            applicationDate: v.createdAt ? new Date(v.createdAt).toLocaleDateString('en-GB') : '2026',
            submissionSlot: v.createdAt ? new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Zone 01',
            registryCheck: 'Pending Verification',
            zone: 'HQ Zone 01 • Dispatch Center',
            avatarInitials: (v.name || 'Applicant')
              .split(' ')
              .filter(Boolean)
              .map(n => n[0])
              .join('')
              .substring(0, 2)
              .toUpperCase() || 'AP',
          }));
          setPendingVolunteers(livePend);
        }
      } else if (currentUser?.role === 'volunteer') {
        // If volunteer: fetch own profile with accurate availability
        try {
          const myProfile = await api.getMyVolunteerProfile();
          if (myProfile?.volunteer) {
            const isAvail = myProfile.volunteer.is_available ?? myProfile.volunteer.isAvailable ?? false;
            setOnDuty(Boolean(isAvail));
          }
        } catch {
          // Profile endpoint optional
        }
      }
    } catch (err: any) {
      console.warn('Backend volunteers query notice:', err);
    }
  }, [currentUser?.role]);

  // Fetch individual request with audit history timeline
  const fetchRequestDetails = useCallback(async (reqId: string): Promise<EmergencyRequest | null> => {
    if (!getAccessToken() || !reqId) return null;
    try {
      const res = await api.getRequestById(reqId);
      if (res && res.request) {
        const mapped = mapBackendRequestToFrontend(res.request, res.history);
        setRequests(prev => {
          const index = prev.findIndex(r => r.id === mapped.id);
          if (index >= 0) {
            const next = [...prev];
            next[index] = mapped;
            return next;
          }
          return [mapped, ...prev];
        });
        return mapped;
      }
    } catch (err) {
      console.warn(`Could not load request ${reqId} detail from backend:`, err);
    }
    return null;
  }, []);

  // Auto-fetch data on initial mount or when user changes
  useEffect(() => {
    const token = getAccessToken();
    if (token && currentUser) {
      refreshRequests();
      refreshVolunteers();
    }
  }, [currentUser, refreshRequests, refreshVolunteers]);

  // Periodic CAD telemetry polling (every 5 seconds) to ensure real-time admin & volunteer sync
  useEffect(() => {
    const token = getAccessToken();
    if (!token || !currentUser) return;

    const timer = setInterval(() => {
      refreshRequests();
      refreshVolunteers();
    }, 5000);

    const onFocus = () => {
      refreshRequests();
      refreshVolunteers();
    };

    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [currentUser, refreshRequests, refreshVolunteers]);

  const navigate = (route: string, reqId?: string) => {
    if (reqId) {
      setActiveRequestId(reqId);
      fetchRequestDetails(reqId);
    }
    setCurrentRoute(route);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const login = async (email: string, pass: string): Promise<{ success: boolean; message?: string }> => {
    try {
      setLoading(true);
      setError(null);

      // Authenticate with real backend
      const res = await api.authLogin(email, pass);

      const userObj: User = {
        id: res.userId,
        name: res.role === 'police_admin' ? 'Police Admin' : (res.email.split('@')[0] || 'Volunteer'),
        email: res.email,
        phone: '+91 98450 11022',
        role: res.role,
        status: (res.account_status as any) || 'active',
        badgeOrId:
          res.role === 'police_admin'
            ? 'POL-DISP-409'
            : res.volunteerId
            ? `VOL #${res.volunteerId.slice(-4).toUpperCase()}`
            : `VOL #${res.userId.slice(-4).toUpperCase()}`,
        departmentOrDivision: res.role === 'police_admin' ? 'HQ Division 01 North Sector' : 'Civic First Response Unit',
      };

      setCurrentUser(userObj);
      setStoredUser(userObj);

      if (userObj.role === 'police_admin') {
        setCurrentRoute('admin-dashboard');
      } else {
        if (userObj.status === 'pending') {
          setCurrentRoute('volunteer-pending');
        } else {
          setCurrentRoute('volunteer-dashboard');
        }
      }

      await refreshRequests();
      await refreshVolunteers();

      return { success: true };
    } catch (apiErr: any) {
      // Failed login MUST remain failed - NO demo user creation or fallback!
      return { success: false, message: apiErr.message || 'Invalid email or password.' };
    } finally {
      setLoading(false);
    }
  };

  const registerVolunteer = async (data: {
    name: string;
    phone_number: string;
    email: string;
    password: string;
    otp: string;
  }): Promise<{ success: boolean; message?: string }> => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.authRegister(data);

      const pendingUser: User = {
        id: res.userId,
        name: data.name,
        email: data.email,
        phone: data.phone_number,
        role: 'volunteer',
        status: 'pending',
        badgeOrId: `TICKET #${res.userId.slice(-6).toUpperCase()}`,
        departmentOrDivision: 'Civic Access Protocol 10-A',
      };

      setCurrentUser(pendingUser);
      setStoredUser(pendingUser);
      setCurrentRoute('volunteer-pending');

      return { success: true, message: res.message };
    } catch (err: any) {
      return { success: false, message: err.message || 'Registration failed.' };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    api.logout();
    clearAuthTokens();
    setStoredUser(null);
    setCurrentUser(null);
    setCurrentRoute('login');
    setRequests([]);
    setVolunteers([]);
    setPendingVolunteers([]);
  };

  const updateRequestStatus = async (requestId: string, newStatus: IncidentStatus) => {
    const backendStatus = mapStatusToBackend(newStatus);
    await api.updateRequestStatus(requestId, backendStatus);
    await fetchRequestDetails(requestId);
    await refreshRequests();
  };

  const acceptAssignedRequest = async (requestId: string) => {
    await api.acceptRequest(requestId);
    await fetchRequestDetails(requestId);
    await refreshRequests();
  };

  const rejectAssignedRequest = async (requestId: string, reason?: string) => {
    await api.rejectRequest(requestId, reason);
    await fetchRequestDetails(requestId);
    await refreshRequests();
  };

  const assignVolunteerToRequest = async (requestId: string, volunteerId: string, volunteerName: string) => {
    await api.assignVolunteer(requestId, volunteerId);
    await fetchRequestDetails(requestId);
    await refreshRequests();
    await refreshVolunteers();
  };

  const autoAssignVolunteerToRequest = async (requestId: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await api.autoAssignVolunteer(requestId);
      await fetchRequestDetails(requestId);
      await refreshRequests();
      await refreshVolunteers();
      return { success: true, message: `Volunteer ${res.volunteerId} automatically assigned.` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Auto-assignment failed.' };
    }
  };

  const toggleDuty = async (targetDuty?: boolean) => {
    if (dutyLoading) return;
    const nextDuty = typeof targetDuty === 'boolean' ? targetDuty : !onDuty;
    setDutyLoading(true);
    setError(null);
    try {
      const res = await api.updateVolunteerAvailability('me', nextDuty);
      const confirmedState = (res.is_available != null)
        ? Boolean(res.is_available)
        : (res.isAvailable != null ? Boolean(res.isAvailable) : nextDuty);
      setOnDuty(confirmedState);
      await Promise.allSettled([refreshRequests(), refreshVolunteers()]);
    } catch (err: any) {
      console.warn('Failed to update availability on backend:', err);
      // Revert UI immediately to verified backend state on failure
      try {
        const profile = await api.getMyVolunteerProfile();
        if (profile?.volunteer) {
          const isAvail = profile.volunteer.is_available ?? profile.volunteer.isAvailable ?? false;
          setOnDuty(Boolean(isAvail));
        }
      } catch {}
      setError(err.message || 'Failed to update readiness status.');
      throw err;
    } finally {
      setDutyLoading(false);
    }
  };

  const escalateRequest = async (requestId: string, department: string, notes?: string) => {
    await api.escalateRequest(requestId, 'emergency', notes || `Escalated to ${department}`);
    await fetchRequestDetails(requestId);
    await refreshRequests();
  };

  const approveVolunteer = async (volunteerId: string) => {
    await api.updateVolunteerVerification(volunteerId, 'verified');
    await refreshVolunteers();
  };

  const rejectVolunteer = async (volunteerId: string) => {
    await api.updateVolunteerVerification(volunteerId, 'rejected');
    await refreshVolunteers();
  };

  const markNotificationRead = (notifId: string) => {
    setNotifications(prev => prev.map(n => (n.id === notifId ? { ...n, read: true } : n)));
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        currentRoute,
        activeRequestId,
        requests,
        volunteers,
        availableVolunteers,
        pendingVolunteers,
        notifications,
        onDuty,
        dutyLoading,
        loading,
        error,
        setOnDuty,
        login,
        registerVolunteer,
        logout,
        navigate,
        updateRequestStatus,
        assignVolunteerToRequest,
        autoAssignVolunteerToRequest,
        acceptAssignedRequest,
        rejectAssignedRequest,
        toggleDuty,
        refreshRequests,
        refreshVolunteers,
        fetchRequestDetails,
        escalateRequest,
        approveVolunteer,
        rejectVolunteer,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
