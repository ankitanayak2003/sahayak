export type UserRole = 'police_admin' | 'volunteer';
export type VolunteerAccountStatus = 'pending' | 'approved' | 'active' | 'rejected';
export type IncidentSeverity = 'Critical' | 'Urgent' | 'Normal';
export type IncidentCategory = 'Medical' | 'Accident' | 'Fire' | 'Missing' | 'Civil' | 'Traffic';
export type IncidentStatus = 'Pending' | 'Assigned' | 'Accepted' | 'In Progress' | 'Queued' | 'Escalated' | 'Resolved';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: VolunteerAccountStatus;
  badgeOrId: string;
  departmentOrDivision: string;
  avatarUrl?: string;
  rating?: number;
  completedTasks?: number;
  certification?: string;
}

export interface TimelineEvent {
  title: string;
  timestamp: string;
  description: string;
  completed: boolean;
  current?: boolean;
}

export interface EmergencyRequest {
  id: string; // e.g. '#001'
  refId: string; // e.g. 'MED-88402'
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  location: string;
  geoCoords: string;
  accuracy: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  locationSource?: string | null;
  locationCapturedAt?: string | null;
  createdAt: string;
  elapsedMinutes: number;
  assignedVolunteerId?: string;
  assignedVolunteerName?: string;
  assignedVolunteerBadge?: string;
  assignedVolunteerEta?: string;
  assignedVolunteerAvatar?: string;
  queuePosition?: number;
  aiClassification: {
    predictedCategory: string;
    confidence: number;
    calculatedSeverity: IncidentSeverity;
    clinicalSignals: string[];
    transcriptSummary: string;
    audioDuration: string;
  };
  timeline: TimelineEvent[];
  equipmentNeeded?: string[];
  callerInfo?: {
    name: string;
    contact: string;
    station: string;
  };
}

export interface VolunteerMember {
  id: string; // e.g. '#001'
  name: string;
  email: string;
  phone: string;
  status: 'Active' | 'On Duty' | 'On Break' | 'Inactive';
  accountStatus: VolunteerAccountStatus;
  activeAssignments: number;
  workloadCount?: number;
  activeCount?: number;
  queuedCount?: number;
  isAvailable?: boolean;
  assignmentText?: string;
  roleDescription: string;
  certification: string;
  rating: number;
  completedResponses: number;
  submittedAt: string;
  applicationDate: string;
  submissionSlot: string;
  registryCheck: string;
  zone: string;
  avatarInitials: string;
  avatarUrl?: string;
}

export interface AppNotification {
  id: string;
  targetRole: UserRole;
  targetVolunteerId?: string;
  type: 'critical' | 'urgent' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  link?: string;
}
