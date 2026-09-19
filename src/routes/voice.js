const express = require('express');
const { ObjectId } = require('mongodb');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const { getDB } = require('../config/mongodb');
const { decideRequest } = require('../services/aiDecisionService');
const { normalizePhoneNumber, createPhoneBlindIndex } = require('../utils/phoneSecurity');

const router = express.Router();
const dtmfMap = { '1': 'medicine', '2': 'groceries', '3': 'transport', '4': 'emergency', '5': 'other' };

router.post('/webhook', asyncHandler(async (req, res) => {
  const { call_sid: callSid, caller_phone: callerPhone, dtmf } = req.body || {};
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return error(res, 400, 'Invalid webhook body.');
  if (typeof callSid !== 'string' || !callSid.trim() || typeof callerPhone !== 'string' || !callerPhone.trim()) return error(res, 400, 'call_sid and caller_phone are required.');
  if (typeof dtmf !== 'string' || !Object.hasOwn(dtmfMap, dtmf.trim())) return error(res, 400, 'Invalid DTMF digit.');
  const db = getDB();
  const callLogs = db.collection('call_logs');
  const existing = await callLogs.findOne({ call_sid: callSid });
  if (existing) return success(res, 200, { call_sid: callSid, next_action: 'already_processed', message: 'Call already processed.' });

  const category = dtmfMap[String(dtmf)] || 'other';
  const urgency = String(dtmf) === '4' ? 'critical' : 'routine';
  const decision = decideRequest({ urgency, ai_confidence: 1 });
  const timestamp = new Date();
  const normalizedPhone = normalizePhoneNumber(callerPhone);
  const request = { senior_citizen_phone_blind_index: createPhoneBlindIndex(normalizedPhone), category, urgency_level: urgency, ai_confidence: 1, description: 'Provider-neutral DTMF webhook request.', source_channel: 'voice_call', call_sid: callSid, status: decision.emergency ? 'escalated_to_112' : 'pending_assignment', created_at: timestamp, updated_at: timestamp };
  const requestResult = await db.collection('assistance_requests').insertOne(request);
  await callLogs.insertOne({ call_sid: callSid, request_id: requestResult.insertedId, source: 'voice_webhook', created_at: timestamp });
  await db.collection('request_status_history').insertOne({ request_id: requestResult.insertedId, action: 'REQUEST_CREATED', status: request.status, previous_state: null, new_state: request.status, performed_by: null, performed_by_role: 'voice_service', changed_by: null, reason: 'Created from DTMF webhook.', metadata: { call_sid: callSid, dtmf: dtmf.trim() }, created_at: timestamp });
  if (decision.emergency) await db.collection('request_status_history').insertOne({ request_id: requestResult.insertedId, action: 'REQUEST_ESCALATED', status: request.status, previous_state: null, new_state: request.status, performed_by: null, performed_by_role: 'voice_service', changed_by: null, reason: 'DTMF emergency.', metadata: { call_sid: callSid }, created_at: timestamp });
  if (decision.emergency) await db.collection('emergency_escalations').insertOne({ request_id: requestResult.insertedId, escalation_type: 'emergency', escalated_to: '112', acknowledged_by: null, resolution_status: 'open', created_at: timestamp, updated_at: timestamp });
  return success(res, 201, { call_sid: callSid, requestId: requestResult.insertedId, next_action: decision.emergency ? 'police_review' : 'pending_assignment', message: 'Voice request recorded.' });
}));

module.exports = router;
