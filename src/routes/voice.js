const express = require('express');
const { ObjectId } = require('mongodb');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const { getDB } = require('../config/mongodb');
const env = require('../config/env');
const { createRequest } = require('../services/requestService');
const { normalizePhoneNumber, createPhoneBlindIndex } = require('../utils/phoneSecurity');
const { isValidBearerAuthorization, isValidBasicAuthorization } = require('../utils/providerAuthentication');

const router = express.Router();
const dtmfMap = { '1': 'medicine', '2': 'groceries', '3': 'transport', '4': 'emergency', '5': 'other' };

let callSidIndexPromise;
async function ensureCallSidIndex(callLogs) {
  if (typeof callLogs.createIndex !== 'function') return;
  if (!callSidIndexPromise) {
    callSidIndexPromise = callLogs.createIndex(
      { call_sid: 1 },
      { name: 'uniq_call_sid', unique: true, sparse: true }
    ).catch((err) => {
      callSidIndexPromise = null;
      throw err;
    });
  }
  await callSidIndexPromise;
}

function requireVoiceWebhookAuthentication(req, res, next) {
  const authHeader = req.get('Authorization');
  if (!authHeader) {
    return error(res, 401, 'Authentication required.');
  }

  const validBearer =
    isValidBearerAuthorization(authHeader, env.SAHAYAK_TOOL_SHARED_SECRET) ||
    isValidBearerAuthorization(authHeader, env.SARVAM_TOOL_SHARED_SECRET);
  const validBasic =
    Boolean(env.EXOTEL_WS_USERNAME && env.EXOTEL_WS_PASSWORD) &&
    isValidBasicAuthorization(authHeader, env.EXOTEL_WS_USERNAME, env.EXOTEL_WS_PASSWORD);

  if (!validBearer && !validBasic) {
    return error(res, 401, 'Invalid authentication credentials.');
  }

  return next();
}

router.post('/webhook', requireVoiceWebhookAuthentication, asyncHandler(async (req, res) => {
  const { call_sid: callSid, caller_phone: callerPhone, dtmf } = req.body || {};
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return error(res, 400, 'Invalid webhook body.');
  if (typeof callSid !== 'string' || !callSid.trim() || typeof callerPhone !== 'string' || !callerPhone.trim()) return error(res, 400, 'call_sid and caller_phone are required.');
  if (typeof dtmf !== 'string' || !Object.hasOwn(dtmfMap, dtmf.trim())) return error(res, 400, 'Invalid DTMF digit.');

  let normalizedPhone;
  try {
    normalizedPhone = normalizePhoneNumber(callerPhone);
  } catch (phoneErr) {
    return error(res, 400, 'Invalid caller phone number.');
  }

  const db = getDB();
  const callLogs = db.collection('call_logs');
  await ensureCallSidIndex(callLogs);

  const existing = await callLogs.findOne({ call_sid: callSid });
  if (existing) return success(res, 200, { call_sid: callSid, next_action: 'already_processed', message: 'Call already processed.' });

  const category = dtmfMap[String(dtmf)] || 'other';
  const urgency = String(dtmf) === '4' ? 'critical' : 'routine';
  const timestamp = new Date();

  let request;
  try {
    request = await createRequest(db, {
      category,
      urgencyLevel: urgency,
      aiConfidence: 1,
      description: 'Provider-neutral DTMF webhook request.',
      sourceChannel: 'voice_call',
      seniorCitizenPhone: normalizedPhone,
      escalationType: 'emergency',
      metadata: { call_sid: callSid, dtmf: dtmf.trim() },
      extraFields: { senior_citizen_phone_blind_index: createPhoneBlindIndex(normalizedPhone), call_sid: callSid },
      creationReason: 'Created from DTMF webhook.',
    }, { role: 'voice_service' });
  } catch (requestErr) {
    throw requestErr;
  }

  try {
    await callLogs.insertOne({ call_sid: callSid, request_id: request._id, source: 'voice_webhook', created_at: timestamp });
  } catch (insertErr) {
    if (insertErr?.code === 11000) {
      return success(res, 200, { call_sid: callSid, next_action: 'already_processed', message: 'Call already processed.' });
    }
    throw insertErr;
  }

  return success(res, 201, { call_sid: callSid, requestId: request._id, next_action: request.status === 'escalated_to_112' ? 'police_review' : 'pending_assignment', message: 'Voice request recorded.' });
}));

module.exports = router;
module.exports.requireVoiceWebhookAuthentication = requireVoiceWebhookAuthentication;
