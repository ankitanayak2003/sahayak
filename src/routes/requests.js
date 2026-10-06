const express = require('express');
const { ObjectId } = require('mongodb');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const { getDB } = require('../config/mongodb');
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/requireRole');
const { ROLES } = require('../config/constants');
const { citizenSosRateLimiter } = require('../middleware/rateLimiter');
const { normalizePhoneNumber, isValidPhone } = require('../utils/phoneSecurity');
const {
  createRequest,
  hasActiveAssignment,
  rejectAssignment,
  transitionRequest,
  assignOrQueueVolunteer,
  autoAssignRequest,
  REQUEST_STATUSES,
} = require('../services/requestService');
const { selectEligibleVolunteer, getVolunteerWorkload } = require('../services/volunteerAssignmentService');

const router = express.Router();
const idOf = value => (typeof value === 'string' && ObjectId.isValid(value) ? new ObjectId(value) : null);
const allowedCategories = ['medicine', 'transport', 'groceries', 'companionship', 'other', 'emergency', 'fall'];

async function visibleRequest(db, request, user) {
  if (user.role === ROLES.POLICE_ADMIN) return true;
  if (!request.current_assigned_volunteer_id) return false;
  const volunteer = await db.collection('volunteers').findOne({ _id: request.current_assigned_volunteer_id, user_id: new ObjectId(user.id) });
  return Boolean(volunteer);
}

function parsePagination(query) {
  const page = query.page == null ? 1 : Number(query.page);
  const limit = query.limit == null ? 25 : Number(query.limit);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return null;
  }
  return { page, limit, skip: (page - 1) * limit };
}

function activeAssignmentFilter() {
  return {
    $or: [
      { status: 'active' },
      { status: { $exists: false }, expired_at: null },
    ],
  };
}

async function volunteerSummary(db, volunteerId) {
  if (!volunteerId) return null;
  const volunteer = await db.collection('volunteers').findOne({ _id: volunteerId });
  if (!volunteer) return null;
  const user = await db.collection('users').findOne({ _id: volunteer.user_id }, { projection: { name: 1 } });
  const workload = await getVolunteerWorkload(db, volunteerId);
  return {
    volunteerId: volunteer._id,
    name: user?.name || null,
    verificationStatus: volunteer.verification_status,
    isAvailable: volunteer.is_available === true,
    isBusy: workload.active > 0,
    workloadCount: workload.total,
    activeCount: workload.active,
    queuedCount: workload.queued,
  };
}

async function dashboardRequest(db, request) {
  const escalation = await db.collection('emergency_escalations').findOne({ request_id: request._id }, { projection: { escalation_type: 1, notes: 1, escalated_to: 1, acknowledged_by: 1, acknowledged_at: 1, resolution_status: 1, created_at: 1, updated_at: 1 } });
  return {
    requestId: request._id,
    status: request.status,
    category: request.category,
    emergencyType: request.sarvam_emergency_type || request.emergency_type || null,
    urgencyLevel: request.urgency_level,
    severity: request.sarvam_severity || request.severity || null,
    location: request.location_text || request.location || null,
    latitude: request.latitude ?? null,
    longitude: request.longitude ?? null,
    accuracyMeters: request.accuracy_meters ?? null,
    locationSource: request.location_source ?? null,
    locationCapturedAt: request.location_captured_at ?? null,
    description: request.description || '',
    sourceChannel: request.source_channel || null,
    currentAssignedVolunteerId: request.current_assigned_volunteer_id || null,
    assignedVolunteer: await volunteerSummary(db, request.current_assigned_volunteer_id),
    queuePosition: request.queue_position || (request.status === 'assigned' ? 1 : null),
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    escalation: escalation || null,
  };
}

async function adminRequestFilter(db, query) {
  const predicates = [];
  if (query.status != null) {
    if (typeof query.status !== 'string' || !REQUEST_STATUSES.includes(query.status)) return null;
    predicates.push({ status: query.status });
  }
  if (query.urgency != null) {
    if (typeof query.urgency !== 'string' || !['routine', 'urgent', 'critical'].includes(query.urgency)) return null;
    predicates.push({ urgency_level: query.urgency });
  }
  if (query.escalated != null) {
    if (query.escalated !== 'true' && query.escalated !== 'false') return null;
    if (query.escalated === 'true') {
      const openEscalations = await db.collection('emergency_escalations').find({ resolution_status: 'open' }, { projection: { request_id: 1 } }).toArray();
      predicates.push({ $or: [{ status: 'escalated_to_112' }, { _id: { $in: openEscalations.map(item => item.request_id) } }] });
    } else {
      predicates.push({ status: { $ne: 'escalated_to_112' } });
    }
  }
  return predicates.length ? { $and: predicates } : {};
}

router.post('/', authenticate, requireRole(ROLES.POLICE_ADMIN), asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error(res, 400, 'Invalid request body.');
  if (typeof body.category !== 'string' || !body.category.trim() || typeof body.urgency_level !== 'string' || !body.urgency_level.trim()) return error(res, 400, 'Category and urgency_level are required.');
  if (!allowedCategories.includes(body.category.trim().toLowerCase())) return error(res, 400, 'Invalid category.');
  if (!['routine', 'urgent', 'critical'].includes(body.urgency_level)) return error(res, 400, 'Invalid urgency_level.');
  if (body.senior_citizen_id && !idOf(body.senior_citizen_id)) return error(res, 400, 'Invalid senior citizen ID.');
  if (body.ai_confidence != null && (!Number.isFinite(Number(body.ai_confidence)) || Number(body.ai_confidence) < 0 || Number(body.ai_confidence) > 1)) return error(res, 400, 'Invalid AI confidence.');

  const request = await createRequest(getDB(), {
    category: body.category.trim().toLowerCase(),
    urgencyLevel: body.urgency_level,
    aiConfidence: body.ai_confidence,
    description: body.description,
    locationText: body.location_text,
    location: body.location,
    latitude: body.latitude !== undefined ? body.latitude : body.lat,
    longitude: body.longitude !== undefined ? body.longitude : body.lng,
    accuracy_meters: body.accuracy_meters !== undefined ? body.accuracy_meters : body.accuracy,
    location_source: body.location_source || body.locationSource,
    location_captured_at: body.location_captured_at,
    sourceChannel: body.source_channel,
    seniorCitizenId: body.senior_citizen_id ? idOf(body.senior_citizen_id) : null,
    seniorCitizenPhone: body.senior_citizen_phone,
    escalationType: body.category,
  }, req.user);

  return success(res, 201, {
    requestId: request._id,
    status: request.status,
    emergency: request.status === 'escalated_to_112',
    latitude: request.latitude || null,
    longitude: request.longitude || null,
    currentAssignedVolunteerId: request.current_assigned_volunteer_id || null,
    queuePosition: request.queue_position || null,
  });
}));

// Public citizen emergency intake endpoint (with optional GPS / location coordinates)
router.post('/citizen', citizenSosRateLimiter, asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error(res, 400, 'Invalid request body.');

  // Validate description length and type
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') {
      return error(res, 400, 'Description must be a string.');
    }
    if (body.description.trim().length > 500) {
      return error(res, 400, 'Description must not exceed 500 characters.');
    }
  }

  // Validate location text length and type
  const locationRaw = body.location_text !== undefined ? body.location_text : body.location;
  if (locationRaw !== undefined && locationRaw !== null) {
    if (typeof locationRaw !== 'string') {
      return error(res, 400, 'Location text must be a string.');
    }
    if (locationRaw.trim().length > 200) {
      return error(res, 400, 'Location text must not exceed 200 characters.');
    }
  }

  // Validate and normalize optional phone number
  const rawPhone = body.phone !== undefined ? body.phone : body.senior_citizen_phone;
  let normalizedPhone = null;
  if (rawPhone !== undefined && rawPhone !== null && String(rawPhone).trim() !== '') {
    const phoneStr = String(rawPhone).trim();
    if (!isValidPhone(phoneStr)) {
      return error(res, 400, 'Invalid phone number format. Must be a valid 10-15 digit phone number.');
    }
    normalizedPhone = normalizePhoneNumber(phoneStr);
  }

  const rawCategory = (body.category || 'emergency').trim().toLowerCase();
  const category = allowedCategories.includes(rawCategory) ? rawCategory : 'emergency';
  const urgencyLevel = ['routine', 'urgent', 'critical'].includes(body.urgency_level) ? body.urgency_level : 'critical';

  const request = await createRequest(getDB(), {
    category,
    urgencyLevel,
    description: typeof body.description === 'string' && body.description.trim() ? body.description.trim() : 'Citizen SOS emergency report.',
    locationText: locationRaw || (body.latitude != null && body.longitude != null ? `GPS (${body.latitude}, ${body.longitude})` : 'Unknown Location'),
    location: locationRaw,
    latitude: body.latitude !== undefined ? body.latitude : body.lat,
    longitude: body.longitude !== undefined ? body.longitude : body.lng,
    accuracy_meters: body.accuracy_meters !== undefined ? body.accuracy_meters : body.accuracy,
    location_source: body.location_source || body.locationSource || (body.latitude != null ? 'browser_gps' : 'manual_pin'),
    location_captured_at: body.location_captured_at,
    seniorCitizenPhone: normalizedPhone,
    sourceChannel: 'citizen_web',
    escalationType: category,
  }, { role: 'citizen' });

  return success(res, 201, {
    requestId: request._id,
    status: request.status,
    emergency: request.status === 'escalated_to_112',
    latitude: request.latitude || null,
    longitude: request.longitude || null,
    location: request.location_text,
    message: 'Emergency request received and logged in dispatch system.',
  });
}));

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const db = getDB();
  if (req.user.role === ROLES.POLICE_ADMIN) {
    const pagination = parsePagination(req.query);
    if (!pagination) return error(res, 400, 'Invalid pagination. page must be >= 1 and limit must be between 1 and 100.');
    const filter = await adminRequestFilter(db, req.query);
    if (!filter) return error(res, 400, 'Invalid request filter.');
    const [requests, total] = await Promise.all([
      db.collection('assistance_requests').find(filter).sort({ created_at: -1 }).skip(pagination.skip).limit(pagination.limit).toArray(),
      db.collection('assistance_requests').countDocuments(filter),
    ]);
    return success(res, 200, {
      requests: await Promise.all(requests.map(request => dashboardRequest(db, request))),
      pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) },
    });
  }
  if (req.user.role === ROLES.VOLUNTEER) {
    const volunteer = await db.collection('volunteers').findOne({ user_id: new ObjectId(req.user.id) });
    if (!volunteer) return success(res, 200, { requests: [] });
    const rawRequests = await db
      .collection('assistance_requests')
      .find({ current_assigned_volunteer_id: volunteer._id })
      .toArray();

    const formattedRequests = rawRequests.map(r => ({
      ...r,
      requestId: r._id,
      emergencyType: r.sarvam_emergency_type || r.emergency_type || null,
      severity: r.sarvam_severity || r.severity || null,
      location: r.location_text || r.location || null,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      accuracyMeters: r.accuracy_meters ?? null,
      locationSource: r.location_source ?? null,
      locationCapturedAt: r.location_captured_at ?? null,
      queuePosition: r.queue_position || (r.status === 'assigned' ? 1 : null),
    }));

    const statusWeight = (s) => {
      if (s === 'in_progress') return 1;
      if (s === 'accepted') return 2;
      if (s === 'assigned') return 3;
      if (s === 'queued') return 4;
      return 5;
    };

    formattedRequests.sort((a, b) => {
      const wa = statusWeight(a.status);
      const wb = statusWeight(b.status);
      if (wa !== wb) return wa - wb;
      if (a.status === 'queued' && b.status === 'queued') {
        return (a.queuePosition || 99) - (b.queuePosition || 99);
      }
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    return success(res, 200, { requests: formattedRequests });
  }

  return error(res, 403, 'Forbidden.');
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const id = idOf(req.params.id);
  if (!id) return error(res, 400, 'Invalid request ID.');
  const db = getDB();
  const request = await db.collection('assistance_requests').findOne({ _id: id });
  if (!request) return error(res, 404, 'Request not found.');
  if (!(await visibleRequest(db, request, req.user))) return error(res, 403, 'Forbidden.');
  if (req.user.role === ROLES.POLICE_ADMIN) {
    const history = await db.collection('request_status_history').find({ request_id: id }).sort({ created_at: 1 }).toArray();
    return success(res, 200, { request: await dashboardRequest(db, request), history });
  }
  return success(res, 200, {
    request: {
      ...request,
      requestId: request._id,
      latitude: request.latitude ?? null,
      longitude: request.longitude ?? null,
      accuracyMeters: request.accuracy_meters ?? null,
      locationSource: request.location_source ?? null,
      locationCapturedAt: request.location_captured_at ?? null,
      queuePosition: request.queue_position || null,
    },
  });
}));

router.post('/:id/assign', authenticate, requireRole(ROLES.POLICE_ADMIN), asyncHandler(async (req, res) => {
  const requestId = idOf(req.params.id);
  const volunteerId = idOf(req.body?.volunteer_id);
  if (!requestId || !volunteerId) return error(res, 400, 'Invalid request or volunteer ID.');
  const db = getDB();
  const request = await db.collection('assistance_requests').findOne({ _id: requestId });
  const volunteer = await db.collection('volunteers').findOne({ _id: volunteerId });
  if (!request) return error(res, 404, 'Request not found.');
  if (!volunteer) return error(res, 404, 'Volunteer not found.');
  if (request.status !== 'pending_assignment') return error(res, 409, 'Request is not pending_assignment.');
  if (volunteer.verification_status !== 'verified') return error(res, 409, 'Volunteer is not verified.');
  if (volunteer.is_available !== true) return error(res, 409, 'Volunteer is unavailable.');

  const result = await assignOrQueueVolunteer(db, requestId, volunteerId, req.user, {
    volunteerUserId: volunteer.user_id,
    reason: 'Manually assigned / overridden by police admin.',
    metadata: { volunteer_id: volunteerId, manual_override: true },
  });

  return success(res, 200, {
    message: result.status === 'queued' ? 'Request placed in volunteer queue.' : 'Request assigned.',
    requestId,
    volunteerId,
    status: result.status,
    queuePosition: result.queue_position || 1,
  });
}));

router.post('/:id/auto-assign', authenticate, requireRole(ROLES.POLICE_ADMIN), asyncHandler(async (req, res) => {
  const requestId = idOf(req.params.id);
  if (!requestId) return error(res, 400, 'Invalid request ID.');
  const db = getDB();
  const request = await db.collection('assistance_requests').findOne({ _id: requestId });
  if (!request) return error(res, 404, 'Request not found.');
  if (request.status !== 'pending_assignment') return error(res, 409, 'Request is not pending_assignment.');

  const result = await autoAssignRequest(db, requestId, req.user);
  if (!result || !result.success) {
    return error(res, 409, 'No eligible volunteer is available.');
  }

  return success(res, 200, {
    requestId,
    volunteerId: result.volunteerId,
    status: result.status,
    queuePosition: result.queuePosition || 1,
  });
}));

router.post('/:id/accept', authenticate, requireRole(ROLES.VOLUNTEER), asyncHandler(async (req, res) => {
  const requestId = idOf(req.params.id);
  if (!requestId) return error(res, 400, 'Invalid request ID.');
  const db = getDB();
  const volunteer = await db.collection('volunteers').findOne({ user_id: new ObjectId(req.user.id) });
  const request = await db.collection('assistance_requests').findOne({ _id: requestId });
  if (!request) return error(res, 404, 'Request not found.');
  if (!volunteer || String(request.current_assigned_volunteer_id) !== String(volunteer._id)) return error(res, 403, 'Forbidden.');
  if (request.status !== 'assigned') return error(res, 409, 'Request is not assignable.');
  await transitionRequest(db, requestId, 'accepted', req.user, { reason: 'Accepted by assigned volunteer.' });
  return success(res, 200, { message: 'Request accepted.', status: 'accepted' });
}));

router.post('/:id/reject', authenticate, requireRole(ROLES.VOLUNTEER), asyncHandler(async (req, res) => {
  const requestId = idOf(req.params.id);
  if (!requestId) return error(res, 400, 'Invalid request ID.');
  const db = getDB();
  const volunteer = await db.collection('volunteers').findOne({ user_id: new ObjectId(req.user.id) });
  if (!volunteer) return error(res, 403, 'Forbidden.');
  const request = await db.collection('assistance_requests').findOne({ _id: requestId });
  if (!request) return error(res, 404, 'Request not found.');
  if (String(request.current_assigned_volunteer_id) !== String(volunteer._id)) return error(res, 403, 'Forbidden.');
  if (request.status !== 'assigned' && request.status !== 'queued') return error(res, 409, 'Request is not assigned.');
  const rejected = await rejectAssignment(db, requestId, volunteer._id, req.user);
  return success(res, 200, { requestId, status: rejected.status });
}));

router.patch('/:id/status', authenticate, requireRole(ROLES.VOLUNTEER, ROLES.POLICE_ADMIN), asyncHandler(async (req, res) => {
  const requestId = idOf(req.params.id);
  const status = req.body?.status;
  if (!requestId || !REQUEST_STATUSES.includes(status)) return error(res, 400, 'Invalid request status.');
  const db = getDB();
  const request = await db.collection('assistance_requests').findOne({ _id: requestId });
  if (!request) return error(res, 404, 'Request not found.');
  if (req.user.role === ROLES.VOLUNTEER && !(await visibleRequest(db, request, req.user))) return error(res, 403, 'Forbidden.');
  if (req.user.role === ROLES.VOLUNTEER) {
    const allowedVolunteerTransitions = { accepted: ['in_progress', 'cancelled'], in_progress: ['completed', 'cancelled'] };
    if (!allowedVolunteerTransitions[request.status]?.includes(status)) return error(res, 409, 'Volunteers may only progress their assigned request.');
  }
  await transitionRequest(db, requestId, status, req.user, { reason: 'Status updated.' });
  return success(res, 200, { message: 'Request status updated.', status });
}));

router.get('/:id/history', authenticate, asyncHandler(async (req, res) => {
  const id = idOf(req.params.id);
  if (!id) return error(res, 400, 'Invalid request ID.');
  const db = getDB();
  const request = await db.collection('assistance_requests').findOne({ _id: id });
  if (!request) return error(res, 404, 'Request not found.');
  if (!(await visibleRequest(db, request, req.user))) return error(res, 403, 'Forbidden.');
  return success(res, 200, { history: await db.collection('request_status_history').find({ request_id: id }).sort({ created_at: 1 }).toArray() });
}));

router.post('/:id/escalate', authenticate, requireRole(ROLES.POLICE_ADMIN), asyncHandler(async (req, res) => {
  const id = idOf(req.params.id);
  const escalationType = req.body?.escalation_type;
  if (!id) return error(res, 400, 'Invalid request ID.');
  if (typeof escalationType !== 'string' || !escalationType.trim()) return error(res, 400, 'Escalation type is required.');
  const db = getDB();
  const request = await db.collection('assistance_requests').findOne({ _id: id });
  if (!request) return error(res, 404, 'Request not found.');
  const escalated = await transitionRequest(db, id, 'escalated_to_112', req.user, { escalationType, notes: req.body?.notes || '', reason: 'Escalated by police admin.', metadata: { escalation_type: escalationType } });
  return success(res, 201, { status: escalated.status });
}));

module.exports = router;
