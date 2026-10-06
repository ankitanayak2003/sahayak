import { EmergencyRequest, IncidentCategory, IncidentSeverity, IncidentStatus, TimelineEvent, VolunteerMember, User } from '../types';
const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
const API_BASE_URL = rawBaseUrl.replace(/\/+$/, '');

export const TOKEN_STORAGE_KEY = 'sahayak_access_token';
export const REFRESH_TOKEN_STORAGE_KEY = 'sahayak_refresh_token';
export const USER_STORAGE_KEY = 'sahayak_current_user';

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function setAuthTokens(accessToken: string, refreshToken?: string) {
  localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
  }
}

export function clearAuthTokens() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

export function getStoredUser(): User | null {
  const saved = localStorage.getItem(USER_STORAGE_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

export function setStoredUser(user: User | null) {
  if (user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_STORAGE_KEY);
  }
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Token refresh mutex to prevent duplicate concurrent refresh calls
let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];

function onTokenRefreshed(newToken: string | null) {
  refreshSubscribers.forEach(cb => cb(newToken));
  refreshSubscribers = [];
}

async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  const token = getAccessToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized with token refresh (except for /auth/login and /auth/refresh)
  if (response.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh') && !isRetry) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          const refreshData = await refreshRes.json();
          if (refreshRes.ok && refreshData.success && refreshData.data?.accessToken) {
            setAuthTokens(refreshData.data.accessToken, refreshData.data.refreshToken);
            onTokenRefreshed(refreshData.data.accessToken);
            isRefreshing = false;
            // Retry the original request
            return request<T>(path, options, true);
          } else {
            // Refresh token invalid or revoked
            clearAuthTokens();
            onTokenRefreshed(null);
            isRefreshing = false;
            window.dispatchEvent(new CustomEvent('sahayak:session_expired'));
            throw new Error('Session expired. Please log in again.');
          }
        } catch (refreshErr) {
          clearAuthTokens();
          onTokenRefreshed(null);
          isRefreshing = false;
          window.dispatchEvent(new CustomEvent('sahayak:session_expired'));
          throw new Error('Session expired. Please log in again.');
        }
      } else {
        // Wait for existing refresh to complete
        return new Promise<T>((resolve, reject) => {
          refreshSubscribers.push((newToken) => {
            if (newToken) {
              resolve(request<T>(path, options, true));
            } else {
              reject(new Error('Session expired. Please log in again.'));
            }
          });
        });
      }
    } else {
      clearAuthTokens();
      window.dispatchEvent(new CustomEvent('sahayak:session_expired'));
      throw new Error('Authentication required.');
    }
  }

  let data: ApiResponse<T>;
  try {
    data = await response.json();
  } catch (err) {
    throw new Error(`Server returned ${response.status}: Failed to parse JSON response`);
  }

  if (!response.ok || data.success === false) {
    const errorMsg = data.error || `HTTP ${response.status} error`;
    throw new Error(errorMsg);
  }

  return data.data as T;
}

export interface BackendLoginResponse {
  userId: string;
  email: string;
  role: 'police_admin' | 'volunteer';
  account_status: string;
  volunteerId?: string;
  accessToken: string;
  refreshToken: string;
  message?: string;
}

export interface BackendVolunteer {
  volunteerId: string;
  userId?: string;
  name: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  verificationStatus: string;
  isAvailable: boolean;
  is_available?: boolean;
  isBusy?: boolean;
  workloadCount?: number;
  activeCount?: number;
  queuedCount?: number;
  createdAt?: string;
  currentAssignment?: {
    requestId: string;
    status: string;
  } | null;
}

export interface BackendRequest {
  requestId?: string;
  _id?: string;
  status: string;
  category: string;
  emergencyType?: string | null;
  urgencyLevel: string;
  severity?: string | null;
  location?: string | null;
  location_text?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  accuracy_meters?: number | null;
  locationSource?: string | null;
  location_source?: string | null;
  locationCapturedAt?: string | null;
  location_captured_at?: string | null;
  description?: string;
  sourceChannel?: string | null;
  source_channel?: string | null;
  currentAssignedVolunteerId?: string | null;
  current_assigned_volunteer_id?: string | null;
  queuePosition?: number | null;
  queue_position?: number | null;
  assignedVolunteer?: {
    volunteerId: string;
    name: string | null;
    verificationStatus: string;
    isAvailable: boolean;
    isBusy: boolean;
    workloadCount?: number;
    activeCount?: number;
    queuedCount?: number;
  } | null;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  escalation?: {
    _id?: string;
    escalation_type: string;
    notes?: string;
    escalated_to: string;
    resolution_status: string;
    created_at: string;
    updated_at: string;
  } | null;
}

export interface BackendHistoryItem {
  _id: string;
  request_id: string;
  action: string;
  status: string;
  previous_state: string | null;
  new_state: string;
  performed_by?: string | null;
  performed_by_role?: string | null;
  changed_by?: string | null;
  reason?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

// ---------------- Adapters ----------------

export function mapCategoryToFrontend(cat?: string): IncidentCategory {
  if (!cat) return 'Medical';
  const c = cat.toLowerCase();
  if (c.includes('med') || c === 'fall' || c === 'emergency') return 'Medical';
  if (c.includes('accid') || c.includes('crash')) return 'Accident';
  if (c.includes('fire')) return 'Fire';
  if (c.includes('miss')) return 'Missing';
  if (c.includes('traf') || c === 'transport') return 'Traffic';
  return 'Civil';
}

export function mapCategoryToBackend(cat: IncidentCategory): string {
  switch (cat) {
    case 'Medical': return 'medicine';
    case 'Accident': return 'other';
    case 'Fire': return 'emergency';
    case 'Missing': return 'other';
    case 'Traffic': return 'transport';
    default: return 'other';
  }
}

export function mapSeverityToFrontend(urgencyOrSeverity?: string | null): IncidentSeverity {
  if (!urgencyOrSeverity) return 'Normal';
  const s = urgencyOrSeverity.toLowerCase();
  if (s === 'critical') return 'Critical';
  if (s === 'urgent') return 'Urgent';
  return 'Normal';
}

export function mapSeverityToBackend(sev: IncidentSeverity): string {
  switch (sev) {
    case 'Critical': return 'critical';
    case 'Urgent': return 'urgent';
    default: return 'routine';
  }
}

export function mapStatusToFrontend(status?: string): IncidentStatus {
  if (!status) return 'Pending';
  switch (status) {
    case 'pending_assignment': return 'Pending';
    case 'assigned': return 'Assigned';
    case 'accepted': return 'Accepted';
    case 'in_progress': return 'In Progress';
    case 'queued': return 'Queued';
    case 'escalated_to_112': return 'Escalated';
    case 'completed': return 'Resolved';
    case 'cancelled': return 'Resolved';
    case 'rejected': return 'Pending';
    default:
      if (['Pending', 'Assigned', 'Accepted', 'In Progress', 'Queued', 'Escalated', 'Resolved'].includes(status)) {
        return status as IncidentStatus;
      }
      return 'Pending';
  }
}

export function mapStatusToBackend(status: IncidentStatus): string {
  switch (status) {
    case 'Pending': return 'pending_assignment';
    case 'Assigned': return 'assigned';
    case 'Accepted': return 'accepted';
    case 'In Progress': return 'in_progress';
    case 'Queued': return 'queued';
    case 'Escalated': return 'escalated_to_112';
    case 'Resolved': return 'completed';
    default: return 'pending_assignment';
  }
}

export function mapBackendHistoryToTimeline(historyItems: BackendHistoryItem[]): TimelineEvent[] {
  if (!historyItems || historyItems.length === 0) {
    return [
      {
        title: 'Created',
        timestamp: 'Just now',
        description: 'Incident received and logged in dispatch system.',
        completed: true,
      },
    ];
  }

  return historyItems.map((item, index) => {
    const isLast = index === historyItems.length - 1;
    const timeFormatted = item.created_at
      ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Just now';

    let title = 'Action';
    if (item.action === 'REQUEST_CREATED') title = 'Created';
    else if (item.action === 'REQUEST_ASSIGNED') title = 'Assigned';
    else if (item.action === 'ASSIGNMENT_ACCEPTED') title = 'Accepted';
    else if (item.action === 'STATUS_UPDATED') title = mapStatusToFrontend(item.status);
    else if (item.action === 'REQUEST_ESCALATED') title = 'Escalated';
    else if (item.status) title = mapStatusToFrontend(item.status);

    return {
      title,
      timestamp: timeFormatted,
      description: item.reason || `Status progressed to ${item.status || item.action}`,
      completed: true,
      current: isLast,
    };
  });
}

export function mapBackendRequestToFrontend(req: BackendRequest, historyItems?: BackendHistoryItem[]): EmergencyRequest {
  const reqId = String(req.requestId || req._id || '');
  const refCode = reqId.length >= 6 ? reqId.slice(-6).toUpperCase() : reqId;
  const rawCreated = req.createdAt || req.created_at;
  const createdDate = rawCreated ? new Date(rawCreated) : new Date();
  const elapsedMinutes = Math.max(1, Math.round((Date.now() - createdDate.getTime()) / 60000));
  const category = mapCategoryToFrontend(req.category);
  const severity = mapSeverityToFrontend(req.severity || req.urgencyLevel);
  const status = mapStatusToFrontend(req.status);

  const rawVolId = req.assignedVolunteer?.volunteerId || req.currentAssignedVolunteerId || req.current_assigned_volunteer_id;
  const volunteerId = rawVolId ? String(rawVolId) : undefined;
  const volunteerName = req.assignedVolunteer?.name || (volunteerId ? `Volunteer #${volunteerId.slice(-4).toUpperCase()}` : undefined);
  const volunteerBadge = volunteerId ? `VOL #${volunteerId.slice(-4).toUpperCase()}` : undefined;

  let timeline: TimelineEvent[];
  if (historyItems && historyItems.length > 0) {
    timeline = mapBackendHistoryToTimeline(historyItems);
  } else {
    const timeStr = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    timeline = [
      {
        title: 'Created',
        timestamp: timeStr,
        description: 'Inbound request ingested by dispatch system',
        completed: true,
      },
    ];

    if (status === 'Assigned' || status === 'Accepted' || status === 'In Progress' || status === 'Resolved') {
      timeline.push({
        title: 'Assigned',
        timestamp: 'Recently',
        description: volunteerName ? `Allocated to ${volunteerName}` : 'Responder assigned',
        completed: true,
      });
    }

    if (status === 'Accepted' || status === 'In Progress' || status === 'Resolved') {
      timeline.push({
        title: 'Accepted',
        timestamp: 'Recently',
        description: 'Responder acknowledged dispatch',
        completed: true,
      });
    }

    if (status === 'In Progress') {
      timeline.push({
        title: 'In Progress',
        timestamp: 'Active',
        description: 'Responder en route to scene',
        completed: false,
        current: true,
      });
    }

    if (status === 'Escalated') {
      timeline.push({
        title: 'Escalated',
        timestamp: 'Immediate',
        description: req.escalation?.notes || 'Escalated to 112 Emergency Dispatch',
        completed: true,
        current: true,
      });
    }

    if (status === 'Resolved') {
      timeline.push({
        title: 'Resolved',
        timestamp: 'Completed',
        description: 'Incident response completed and verified',
        completed: true,
      });
    }

    if (status === 'Queued') {
      timeline.push({
        title: 'Queued',
        timestamp: 'Dispatch Queue',
        description: volunteerName ? `Placed in ${volunteerName}'s dispatch queue` : 'Queued for responder',
        completed: true,
        current: true,
      });
    }
  }

  const locationText = req.location || req.location_text || 'Location Details Pending';
  const queuePos = req.queuePosition ?? (req as any).queue_position ?? (status === 'Assigned' ? 1 : undefined);

  const rawLat = req.latitude ?? (req as any).lat;
  const rawLng = req.longitude ?? (req as any).lng;
  const numLat = rawLat != null && Number.isFinite(Number(rawLat)) ? Number(rawLat) : null;
  const numLng = rawLng != null && Number.isFinite(Number(rawLng)) ? Number(rawLng) : null;
  const hasValidCoords = numLat !== null && numLng !== null;

  const rawAcc = req.accuracyMeters ?? req.accuracy_meters;
  const numAcc = rawAcc != null && Number.isFinite(Number(rawAcc)) ? Number(rawAcc) : null;
  const locSource = req.locationSource || req.location_source || (hasValidCoords ? 'GPS' : null);
  const locCapturedAt = req.locationCapturedAt || req.location_captured_at || null;

  const geoCoords = hasValidCoords
    ? `${Math.abs(numLat).toFixed(4)}° ${numLat >= 0 ? 'N' : 'S'}, ${Math.abs(numLng).toFixed(4)}° ${numLng >= 0 ? 'E' : 'W'}`
    : 'Coordinates unavailable';

  const accuracy = numAcc != null
    ? `±${numAcc}m (${locSource || 'GPS'})`
    : (hasValidCoords ? 'Coordinates acquired' : 'No GPS Fix');

  return {
    id: reqId,
    refId: `REQ-${refCode}`,
    category,
    severity,
    status,
    title: req.description ? req.description.split('\n')[0].substring(0, 60) : `${category} Emergency Assistance`,
    description: req.description || 'Assistance request logged via Sahayak Emergency Gateway.',
    location: locationText,
    geoCoords,
    accuracy,
    latitude: numLat,
    longitude: numLng,
    accuracyMeters: numAcc,
    locationSource: locSource,
    locationCapturedAt: locCapturedAt,
    createdAt: createdDate.toLocaleDateString('en-US', { hour: '2-digit', minute: '2-digit' }),
    elapsedMinutes,
    assignedVolunteerId: volunteerId,
    assignedVolunteerName: volunteerName,
    assignedVolunteerBadge: volunteerBadge,
    assignedVolunteerEta: volunteerName ? '~5 mins' : undefined,
    queuePosition: queuePos,
    equipmentNeeded: ['First-Aid Kit', 'Field Vest', 'Emergency Kit'],
    callerInfo: {
      name: 'Sahayak Emergency Gateway',
      contact: '+91 80 2521 8840',
      station: 'Division 01 Command Center',
    },
    aiClassification: {
      predictedCategory: req.emergencyType || category,
      confidence: 96,
      calculatedSeverity: severity,
      clinicalSignals: [
        req.emergencyType ? `${req.emergencyType.toUpperCase()} Signal` : 'Priority Signal',
        `Urgency: ${req.urgencyLevel || 'Standard'}`,
        req.sourceChannel || req.source_channel || 'Voice Stream',
      ],
      transcriptSummary: req.description || 'Incoming voice transmission parsed and classified.',
      audioDuration: '00:35',
    },
    timeline,
  };
}

export function mapBackendVolunteerToFrontend(vol: BackendVolunteer): VolunteerMember {
  const volId = String(vol.volunteerId);
  const name = vol.name || `Volunteer ${volId.slice(-4)}`;
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'VO';

  const isVerified = vol.verificationStatus === 'verified';
  const isPending = vol.verificationStatus === 'pending';
  const isAvailable = vol.isAvailable === true || vol.is_available === true;
  const workload = vol.workloadCount != null ? vol.workloadCount : (vol.isBusy ? 1 : 0);
  const activeCount = vol.activeCount != null ? vol.activeCount : (vol.isBusy ? 1 : 0);
  const queuedCount = vol.queuedCount != null ? vol.queuedCount : 0;

  // Status reflecting availability & active deployment
  const status: 'Active' | 'On Duty' | 'On Break' | 'Inactive' = isAvailable
    ? (workload > 0 ? 'On Duty' : 'Active')
    : 'Inactive';

  const assignmentText = workload > 0
    ? `${workload} active/queued`
    : '0 (Available)';

  return {
    id: volId,
    name,
    email: vol.email || `volunteer.${volId.slice(-4)}@sahayak.org`,
    phone: vol.phoneNumber || '+91 98450 11022',
    status,
    accountStatus: isVerified ? 'active' : isPending ? 'pending' : 'rejected',
    activeAssignments: workload,
    workloadCount: workload,
    activeCount,
    queuedCount,
    isAvailable,
    assignmentText,
    roleDescription: isPending ? 'Civic Emergency First Responder Applicant' : 'Civic Emergency First Responder',
    certification: isPending ? 'Pending Police Verification' : 'CFR-IV Certified First Responder',
    rating: isPending ? 0 : 4.9,
    completedResponses: isPending ? 0 : 24,
    submittedAt: vol.createdAt ? new Date(vol.createdAt).toLocaleDateString() : 'Active',
    applicationDate: vol.createdAt ? new Date(vol.createdAt).toLocaleDateString('en-GB') : '2026',
    submissionSlot: vol.createdAt ? new Date(vol.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Zone 01',
    registryCheck: isVerified ? 'Verified by Police Admin' : 'Pending Verification',
    zone: 'Division 01 Sector',
    avatarInitials: initials,
  };
}

// ---------------- API Methods ----------------

export const api = {
  async authLogin(email: string, password: string): Promise<BackendLoginResponse> {
    const data = await request<BackendLoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.accessToken) {
      setAuthTokens(data.accessToken, data.refreshToken);
    }
    return data;
  },

  async generateOtp(phone_number: string): Promise<{ message: string; otp?: string; expiresInSeconds?: number }> {
    return request<{ message: string; otp?: string; expiresInSeconds?: number }>('/volunteers/generate-otp', {
      method: 'POST',
      body: JSON.stringify({ phone_number }),
    });
  },

  async authRegister(data: { name: string; phone_number: string; email: string; password: string; otp: string }) {
    return request<{ success: boolean; message: string; userId: string; role: 'volunteer'; account_status: string }>(
      '/volunteers/register',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  },

  async logout(): Promise<void> {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await request<{ message: string }>('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      } catch (e) {
        console.warn('Backend logout failed:', e);
      }
    }
    clearAuthTokens();
  },

  async getRequests(params?: { status?: string; urgency?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.urgency) query.set('urgency', params.urgency);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));

    const path = `/requests${query.toString() ? `?${query.toString()}` : ''}`;
    return request<{ requests: BackendRequest[]; pagination?: any }>(path, { method: 'GET' });
  },

  async getRequestById(id: string) {
    return request<{ request: BackendRequest; history?: BackendHistoryItem[] }>(`/requests/${id}`, { method: 'GET' });
  },

  async getRequestHistory(id: string) {
    return request<{ history: BackendHistoryItem[] }>(`/requests/${id}/history`, { method: 'GET' });
  },

  async getAvailableVolunteers(page = 1, limit = 50) {
    return request<{ volunteers: BackendVolunteer[]; pagination?: any }>(
      `/volunteers/available?page=${page}&limit=${limit}`,
      { method: 'GET' }
    );
  },

  async getVerifiedVolunteers(page = 1, limit = 50) {
    return request<{ volunteers: BackendVolunteer[]; pagination?: any }>(
      `/volunteers/verified?page=${page}&limit=${limit}`,
      { method: 'GET' }
    );
  },

  async getPendingVolunteers(page = 1, limit = 50) {
    return request<{ volunteers: BackendVolunteer[]; pagination?: any }>(
      `/volunteers/pending?page=${page}&limit=${limit}`,
      { method: 'GET' }
    );
  },

  async updateVolunteerVerification(volunteerId: string, status: 'verified' | 'rejected' | 'suspended') {
    return request<{ message: string; volunteerId: string; verification_status: string }>(
      `/volunteers/${volunteerId}/verification`,
      {
        method: 'PATCH',
        body: JSON.stringify({ verification_status: status }),
      }
    );
  },

  async updateVolunteerAvailability(volunteerId: string, isAvailable: boolean) {
    return request<{ message: string; is_available?: boolean; isAvailable?: boolean; volunteerId?: string }>(
      `/volunteers/${volunteerId}/availability`,
      {
        method: 'PATCH',
        body: JSON.stringify({ is_available: isAvailable }),
      }
    );
  },

  async getMyVolunteerProfile() {
    return request<{ volunteer: BackendVolunteer & { name?: string; email?: string } }>('/volunteers/me', {
      method: 'GET',
    });
  },

  async assignVolunteer(requestId: string, volunteerId: string) {
    return request<{ message: string; requestId: string; volunteerId: string; status: string }>(
      `/requests/${requestId}/assign`,
      {
        method: 'POST',
        body: JSON.stringify({ volunteer_id: volunteerId }),
      }
    );
  },

  async autoAssignVolunteer(requestId: string) {
    return request<{ requestId: string; volunteerId: string; status: string }>(
      `/requests/${requestId}/auto-assign`,
      {
        method: 'POST',
      }
    );
  },

  async acceptRequest(requestId: string) {
    return request<{ message: string; status: string }>(
      `/requests/${requestId}/accept`,
      {
        method: 'POST',
      }
    );
  },

  async rejectRequest(requestId: string, reason?: string) {
    return request<{ requestId: string; status: string }>(
      `/requests/${requestId}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ reason: reason || 'Declined by volunteer' }),
      }
    );
  },

  async updateRequestStatus(requestId: string, status: string) {
    return request<{ message: string; status: string }>(
      `/requests/${requestId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    );
  },

  async escalateRequest(requestId: string, escalationType = 'emergency', notes = '') {
    return request<{ status: string }>(
      `/requests/${requestId}/escalate`,
      {
        method: 'POST',
        body: JSON.stringify({ escalation_type: escalationType, notes }),
      }
    );
  },

  async getEmergencies() {
    return request<{ emergencies: any[] }>('/emergencies', { method: 'GET' });
  },

  async acknowledgeEmergency(id: string) {
    return request<{ message: string }>(`/emergencies/${id}/acknowledge`, { method: 'POST' });
  },

  async resolveEmergency(id: string, resolutionStatus = 'resolved', notes = 'Resolved by dispatch') {
    return request<{ message: string; resolution_status: string }>(`/emergencies/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution_status: resolutionStatus, notes }),
    });
  },

  async createCitizenEmergency(data: {
    category?: string;
    description?: string;
    phone?: string;
    location_text?: string;
    latitude?: number | null;
    longitude?: number | null;
    accuracy_meters?: number | null;
    location_source?: string;
    location_captured_at?: string;
  }) {
    return request<{
      requestId: string;
      status: string;
      emergency: boolean;
      latitude: number | null;
      longitude: number | null;
      location: string;
      message: string;
    }>('/requests/citizen', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async createEmergencyRequest(data: {
    category: string;
    urgency_level: string;
    description?: string;
    location_text?: string;
    latitude?: number | null;
    longitude?: number | null;
    accuracy_meters?: number | null;
    location_source?: string;
    location_captured_at?: string;
    senior_citizen_id?: string;
    senior_citizen_phone?: string;
  }) {
    return request<{
      requestId: string;
      status: string;
      emergency: boolean;
      latitude: number | null;
      longitude: number | null;
      currentAssignedVolunteerId: string | null;
      queuePosition: number | null;
    }>('/requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async checkHealth() {
    return request<{ application: string; server: string; database: string }>('/health', { method: 'GET' });
  },
};
