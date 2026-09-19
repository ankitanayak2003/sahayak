const express = require('express');
const { ObjectId } = require('mongodb');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const { getDB } = require('../config/mongodb');
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/requireRole');
const { ROLES } = require('../config/constants');
const { decideRequest } = require('../services/aiDecisionService');
const { createNotification } = require('../services/notificationService');

const router = express.Router();
const idOf = value => (typeof value === 'string' && ObjectId.isValid(value) ? new ObjectId(value) : null);
const now = () => new Date();
const allowedStatuses = ['new', 'pending_assignment', 'assigned', 'accepted', 'in_progress', 'completed', 'cancelled', 'escalated_to_112'];
const allowedCategories = ['medicine', 'transport', 'groceries', 'companionship', 'other', 'emergency', 'fall'];
const allowedTransitions = {
  pending_assignment: ['assigned', 'escalated_to_112', 'cancelled'],
  assigned: ['accepted', 'cancelled', 'escalated_to_112'],
  accepted: ['in_progress', 'cancelled', 'escalated_to_112'],
  in_progress: ['completed', 'cancelled', 'escalated_to_112'],
};

async function addHistory(db, requestId, { action, status, previousState = null, newState = null, userId, userRole, reason, metadata }) {
  await db.collection('request_status_history').insertOne({
    request_id: requestId,
    action,
    status: status || null,
    previous_state: previousState,
    new_state: newState,
    performed_by: userId ? new ObjectId(userId) : null,
    performed_by_role: userRole || null,
    changed_by: userId ? new ObjectId(userId) : null,
    reason: reason || null,
    metadata: metadata || null,
    created_at: now(),
  });
}

async function visibleRequest(db, request, user) {
  if (user.role === ROLES.POLICE_ADMIN) return true;
  if (!request.current_assigned_volunteer_id) return false;
  const volunteer = await db.collection('volunteers').findOne({ _id: request.current_assigned_volunteer_id, user_id: new ObjectId(user.id) });
  return Boolean(volunteer);
}

router.post('/', authenticate, requireRole(ROLES.POLICE_ADMIN), asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error(res, 400, 'Invalid request body.');
  if (typeof body.category !== 'string' || !body.category.trim() || typeof body.urgency_level !== 'string' || !body.urgency_level.trim()) return error(res, 400, 'Category and urgency_level are required.');
  if (!allowedCategories.includes(body.category.trim().toLowerCase())) return error(res, 400, 'Invalid category.');
  if (!['routine', 'urgent', 'critical'].includes(body.urgency_level)) return error(res, 400, 'Invalid urgency_level.');
  if (body.senior_citizen_id && !idOf(body.senior_citizen_id)) return error(res, 400, 'Invalid senior citizen ID.');
  if (body.ai_confidence != null && (!Number.isFinite(Number(body.ai_confidence)) || Number(body.ai_confidence) < 0 || Number(body.ai_confidence) > 1)) return error(res, 400, 'Invalid AI confidence.');

  const db = getDB();
  const decision = decideRequest(body);
  const status = decision.emergency ? 'escalated_to_112' : 'pending_assignment';
  const timestamp = now();
  const request = { senior_citizen_id: body.senior_citizen_id ? idOf(body.senior_citizen_id) : null, senior_citizen_phone: body.senior_citizen_phone || null, category: body.category, urgency_level: body.urgency_level, ai_confidence: body.ai_confidence == null ? null : Number(body.ai_confidence), description: body.description || '', location_text: body.location_text || null, source_channel: body.source_channel || 'app', status, current_assigned_volunteer_id: null, created_by: new ObjectId(req.user.id), created_at: timestamp, updated_at: timestamp };
  const result = await db.collection('assistance_requests').insertOne(request);
  request._id = result.insertedId;
  await addHistory(db, result.insertedId, { action: 'REQUEST_CREATED', status, newState: status, userId: req.user.id, userRole: req.user.role, reason: decision.emergency ? 'Automatic emergency decision.' : 'Request created.', metadata: { emergency: decision.emergency } });
  if (decision.emergency) await addHistory(db, result.insertedId, { action: 'REQUEST_ESCALATED', status, previousState: null, newState: status, userId: req.user.id, userRole: req.user.role, reason: 'Critical or low-confidence request.' });
  if (decision.emergency) await db.collection('emergency_escalations').insertOne({ request_id: result.insertedId, senior_citizen_id: request.senior_citizen_id, escalation_type: body.category, escalated_to: '112', acknowledged_by: null, acknowledged_at: null, resolution_status: 'open', created_at: timestamp, updated_at: timestamp });
  return success(res, 201, { requestId: result.insertedId, status, emergency: decision.emergency });
}));

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const db = getDB();
  let items = await db.collection('assistance_requests').find({}).sort({ created_at: -1 }).limit(100).toArray();
  if (req.user.role === ROLES.VOLUNTEER) items = (await Promise.all(items.map(async item => (await visibleRequest(db, item, req.user)) ? item : null))).filter(Boolean);
  return success(res, 200, { requests: items });
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const id = idOf(req.params.id);
  if (!id) return error(res, 400, 'Invalid request ID.');
  const db = getDB();
  const request = await db.collection('assistance_requests').findOne({ _id: id });
  if (!request) return error(res, 404, 'Request not found.');
  if (!(await visibleRequest(db, request, req.user))) return error(res, 403, 'Forbidden.');
  return success(res, 200, { request });
}));

router.post('/:id/assign', authenticate, requireRole(ROLES.POLICE_ADMIN), asyncHandler(async (req, res) => {
  const requestId = idOf(req.params.id); const volunteerId = idOf(req.body?.volunteer_id);
  if (!requestId || !volunteerId) return error(res, 400, 'Invalid request or volunteer ID.');
  const db = getDB(); const request = await db.collection('assistance_requests').findOne({ _id: requestId }); const volunteer = await db.collection('volunteers').findOne({ _id: volunteerId });
  if (!request) return error(res, 404, 'Request not found.');
  if (!volunteer) return error(res, 404, 'Volunteer not found.');
  if (volunteer.verification_status !== 'verified' || volunteer.is_available !== true) return error(res, 409, 'Volunteer is not verified or available.');
  if (request.status === 'escalated_to_112') return error(res, 409, 'Emergency request cannot be assigned.');
  if (!['new', 'pending_assignment'].includes(request.status)) return error(res, 409, 'Request is not assignable.');
  const timestamp = now();
  await db.collection('assistance_requests').updateOne({ _id: requestId }, { $set: { current_assigned_volunteer_id: volunteerId, status: 'assigned', assigned_at: timestamp, updated_at: timestamp } });
  await db.collection('request_assignments').insertOne({ request_id: requestId, volunteer_id: volunteerId, assigned_at: timestamp, accepted_at: null, expired_at: null });
  await addHistory(db, requestId, { action: 'REQUEST_ASSIGNED', status: 'assigned', previousState: request.status, newState: 'assigned', userId: req.user.id, userRole: req.user.role, reason: 'Assigned by police admin.', metadata: { volunteer_id: volunteerId } });
  await createNotification({ recipientUserId: volunteer.user_id, message: 'A request has been assigned to you.' });
  return success(res, 200, { message: 'Request assigned.', status: 'assigned' });
}));

router.post('/:id/accept', authenticate, requireRole(ROLES.VOLUNTEER), asyncHandler(async (req, res) => {
  const requestId = idOf(req.params.id); if (!requestId) return error(res, 400, 'Invalid request ID.');
  const db = getDB(); const volunteer = await db.collection('volunteers').findOne({ user_id: new ObjectId(req.user.id) }); const request = await db.collection('assistance_requests').findOne({ _id: requestId });
  if (!request) return error(res, 404, 'Request not found.');
  if (!volunteer || String(request.current_assigned_volunteer_id) !== String(volunteer._id)) return error(res, 403, 'Forbidden.');
  if (request.status !== 'assigned') return error(res, 409, 'Request is not assignable.');
  const timestamp = now(); await db.collection('assistance_requests').updateOne({ _id: requestId, status: 'assigned' }, { $set: { status: 'accepted', accepted_at: timestamp, updated_at: timestamp } }); await db.collection('request_assignments').updateOne({ request_id: requestId, volunteer_id: volunteer._id, accepted_at: null }, { $set: { accepted_at: timestamp } }); await addHistory(db, requestId, { action: 'REQUEST_ACCEPTED', status: 'accepted', previousState: 'assigned', newState: 'accepted', userId: req.user.id, userRole: req.user.role, reason: 'Accepted by assigned volunteer.' }); await createNotification({ recipientUserId: new ObjectId(req.user.id), message: 'Request accepted.' }); return success(res, 200, { message: 'Request accepted.', status: 'accepted' });
}));

router.patch('/:id/status', authenticate, requireRole(ROLES.VOLUNTEER, ROLES.POLICE_ADMIN), asyncHandler(async (req, res) => {
  const requestId = idOf(req.params.id); const status = req.body?.status; if (!requestId || !allowedStatuses.includes(status)) return error(res, 400, 'Invalid request status.');
  const db = getDB(); const request = await db.collection('assistance_requests').findOne({ _id: requestId }); if (!request) return error(res, 404, 'Request not found.');
  if (req.user.role === ROLES.VOLUNTEER && !(await visibleRequest(db, request, req.user))) return error(res, 403, 'Forbidden.');
  if (!allowedTransitions[request.status]?.includes(status)) return error(res, 409, 'Invalid request state transition.');
  const timestamp = now(); await db.collection('assistance_requests').updateOne({ _id: requestId }, { $set: { status, updated_at: timestamp } }); await addHistory(db, requestId, { action: 'REQUEST_STATUS_CHANGED', status, previousState: request.status, newState: status, userId: req.user.id, userRole: req.user.role, reason: 'Status updated.' }); await createNotification({ recipientUserId: request.created_by, message: `Request status changed to ${status}.` }); return success(res, 200, { message: 'Request status updated.', status });
}));

router.get('/:id/history', authenticate, asyncHandler(async (req, res) => { const id = idOf(req.params.id); if (!id) return error(res, 400, 'Invalid request ID.'); const db = getDB(); const request = await db.collection('assistance_requests').findOne({ _id: id }); if (!request) return error(res, 404, 'Request not found.'); if (!(await visibleRequest(db, request, req.user))) return error(res, 403, 'Forbidden.'); return success(res, 200, { history: await db.collection('request_status_history').find({ request_id: id }).sort({ created_at: 1 }).toArray() }); }));

router.post('/:id/escalate', authenticate, requireRole(ROLES.POLICE_ADMIN), asyncHandler(async (req, res) => { const id = idOf(req.params.id); const escalationType = req.body?.escalation_type; if (!id) return error(res, 400, 'Invalid request ID.'); if (typeof escalationType !== 'string' || !escalationType.trim()) return error(res, 400, 'Escalation type is required.'); const db = getDB(); const request = await db.collection('assistance_requests').findOne({ _id: id }); if (!request) return error(res, 404, 'Request not found.'); if (!allowedTransitions[request.status]?.includes('escalated_to_112')) return error(res, 409, 'Request cannot be escalated from its current state.'); const timestamp = now(); await db.collection('assistance_requests').updateOne({ _id: id }, { $set: { status: 'escalated_to_112', updated_at: timestamp } }); const escalation = { request_id: id, escalation_type: escalationType, notes: req.body?.notes || '', escalated_to: '112', acknowledged_by: null, acknowledged_at: null, resolution_status: 'open', created_at: timestamp, updated_at: timestamp }; const result = await db.collection('emergency_escalations').insertOne(escalation); await addHistory(db, id, { action: 'REQUEST_ESCALATED', status: 'escalated_to_112', previousState: request.status, newState: 'escalated_to_112', userId: req.user.id, userRole: req.user.role, reason: 'Escalated by police admin.', metadata: { escalation_type: escalationType } }); return success(res, 201, { escalationId: result.insertedId, status: 'escalated_to_112' }); }));

module.exports = router;
