const express = require('express');
const { ObjectId } = require('mongodb');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const { getDB } = require('../config/mongodb');
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/requireRole');
const { ROLES } = require('../config/constants');
const { transitionRequest } = require('../services/requestService');

const router = express.Router();
const idOf = value => (typeof value === 'string' && ObjectId.isValid(value) ? new ObjectId(value) : null);

router.get('/', authenticate, requireRole(ROLES.POLICE_ADMIN), asyncHandler(async (req, res) => success(res, 200, { emergencies: await getDB().collection('emergency_escalations').find({}).sort({ created_at: -1 }).toArray() })));

router.post('/:id/acknowledge', authenticate, requireRole(ROLES.POLICE_ADMIN), asyncHandler(async (req, res) => {
  const id = idOf(req.params.id); if (!id) return error(res, 400, 'Invalid emergency ID.');
  const db = getDB(); const result = await db.collection('emergency_escalations').updateOne({ _id: id, acknowledged_by: null, resolution_status: 'open' }, { $set: { acknowledged_by: new ObjectId(req.user.id), acknowledged_at: new Date(), updated_at: new Date(), resolution_status: 'acknowledged' } });
  if (!result.matchedCount) return error(res, 404, 'Emergency not found or already acknowledged.');
  await db.collection('request_status_history').insertOne({ request_id: (await db.collection('emergency_escalations').findOne({ _id: id })).request_id, action: 'EMERGENCY_ACKNOWLEDGED', status: 'acknowledged', previous_state: 'open', new_state: 'acknowledged', performed_by: new ObjectId(req.user.id), performed_by_role: req.user.role, changed_by: new ObjectId(req.user.id), reason: null, metadata: { emergency_id: id }, created_at: new Date() });
  return success(res, 200, { message: 'Emergency acknowledged.' });
}));

router.post('/:id/resolve', authenticate, requireRole(ROLES.POLICE_ADMIN), asyncHandler(async (req, res) => {
  const id = idOf(req.params.id); const resolutionStatus = req.body?.resolution_status || 'resolved';
  if (!id || !['resolved', 'contact_112_reported'].includes(resolutionStatus)) return error(res, 400, 'Invalid resolution request.');
  if (typeof req.body?.notes !== 'string' || !req.body.notes.trim()) return error(res, 400, 'Resolution notes are required.');
  const db = getDB(); const current = await db.collection('emergency_escalations').findOne({ _id: id });
  if (!current) return error(res, 404, 'Emergency not found.');
  if (current.resolution_status !== 'acknowledged') return error(res, 409, 'Emergency is not ready for resolution.');
  const result = await db.collection('emergency_escalations').updateOne({ _id: id, resolution_status: 'acknowledged' }, { $set: { resolution_status: resolutionStatus, resolution_notes: req.body.notes.trim(), resolved_by: new ObjectId(req.user.id), resolved_at: new Date(), updated_at: new Date() } });
  if (!result.matchedCount) return error(res, 404, 'Emergency not found.');
  const emergency = await db.collection('emergency_escalations').findOne({ _id: id });
  if (emergency.request_id) {
    const linkedRequest = await db.collection('assistance_requests').findOne({ _id: emergency.request_id });
    if (linkedRequest && linkedRequest.status === 'escalated_to_112') {
      await transitionRequest(db, emergency.request_id, 'completed', req.user, {
        reason: req.body.notes.trim(),
        metadata: { emergency_id: id, resolution_status: resolutionStatus },
      });
    }
  }
  await db.collection('request_status_history').insertOne({ request_id: emergency.request_id, action: 'EMERGENCY_RESOLVED', status: resolutionStatus, previous_state: 'acknowledged', new_state: resolutionStatus, performed_by: new ObjectId(req.user.id), performed_by_role: req.user.role, changed_by: new ObjectId(req.user.id), reason: req.body.notes.trim(), metadata: { emergency_id: id }, created_at: new Date() });
  return success(res, 200, { message: 'Emergency resolved.', resolution_status: resolutionStatus });
}));

module.exports = router;
