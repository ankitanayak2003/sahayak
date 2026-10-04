const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const { getDB } = require('../config/mongodb');
const env = require('../config/env');
const { error: responseError } = require('../utils/apiResponse');
const { createRequest } = require('../services/requestService');
const { classifyEmergency, GeminiClassificationError, validateClassification } = require('../services/geminiService');
const { isValidBearerAuthorization } = require('../utils/providerAuthentication');
const { EMERGENCY_TYPES } = require('../config/constants');
const logger = require('../utils/logger');

const router = express.Router();
const emergencyTypes = new Set([...EMERGENCY_TYPES, 'safety threat']);
const severities = new Set(['low', 'medium', 'high', 'critical']);
const categoryByEmergencyType = {
  medical: 'medicine',
  fire: 'emergency',
  accident: 'fall',
  crime: 'emergency',
  safety_threat: 'emergency',
  'safety threat': 'emergency',
  other: 'other',
};
const urgencyBySeverity = {
  low: 'routine',
  medium: 'urgent',
  high: 'critical',
  critical: 'critical',
};

const FORBIDDEN_LOCATIONS = new Set([
  'unknown',
  'unknown location',
  'voice caller location',
  'current location',
  'caller location',
  'unspecified',
  'not provided',
  'n/a',
  'none',
  'here',
  'my location',
]);

function validateEmergencyPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid request body.';

  const requiredStrings = ['caller_phone', 'interaction_id', 'emergency_type', 'location', 'description', 'severity'];
  if (requiredStrings.some((field) => typeof body[field] !== 'string' || !body[field].trim())) {
    return 'caller_phone, interaction_id, emergency_type, location, description, and severity are required.';
  }
  const normalizedLoc = body.location.trim().toLowerCase();
  if (FORBIDDEN_LOCATIONS.has(normalizedLoc)) {
    return 'A valid physical location or landmark is required. Placeholder locations like "Unknown Location" are not allowed.';
  }
  const normalizedType = body.emergency_type.trim().toLowerCase().replace(/\s+/g, '_');
  if (!emergencyTypes.has(body.emergency_type) && !emergencyTypes.has(normalizedType)) return 'Invalid emergency_type.';
  const normalizedSeverity = body.severity.trim().toLowerCase();
  if (!severities.has(body.severity) && !severities.has(normalizedSeverity)) return 'Invalid severity.';
  return null;
}

function requireSarvamToolAuthentication(req, res, next) {
  const authHeader = req.get('Authorization');
  const valid =
    isValidBearerAuthorization(authHeader, env.SAHAYAK_TOOL_SHARED_SECRET) ||
    isValidBearerAuthorization(authHeader, env.SARVAM_TOOL_SHARED_SECRET);

  if (!valid) {
    return responseError(res, 401, 'Authentication required.');
  }
  return next();
}

async function ensureInteractionIndex(requests) {
  if (typeof requests.createIndex !== 'function') return;
  await requests.createIndex(
    { interaction_id: 1 },
    {
      name: 'uniq_sarvam_interaction_id',
      unique: true,
      partialFilterExpression: { interaction_id: { $exists: true } },
    }
  );
}

function isGenuineAssistanceRequest(classification, body = {}) {
  if (classification.is_emergency && classification.disposition === 'emergency') {
    return true;
  }

  if (classification.disposition === 'unclear') {
    return false;
  }

  const combinedText = [
    body.description || '',
    body.conversation_text || '',
    classification.reason || '',
  ].join(' ').toLowerCase();

  const nonAssistancePatterns = [
    /\b(routine\s+(medicin|medication|refill|prescription)|pharmacy\s+delivery)\b/,
    /\b(tomorrow\b.*no\s+immediate\s+danger|no\s+(immediate\s+danger|urgent\s+symptoms|acute\s+symptoms|emergency))\b/,
    /\b(routine\s+appointment|book\s+(an\s+)?appointment|schedule\s+(an\s+)?appointment|doctor\s+appointment)\b/,
    /\b(weather|forecast|general\s+(inquiry|information)|ordinary\s+information)\b/,
    /\b(prank|joke|false\s+alarm)\b/,
  ];

  const isExplicitNonAssistance = nonAssistancePatterns.some((pattern) => pattern.test(combinedText));

  const assistancePatterns = [
    /\b(medical\s+assistance|send\s+a?\s*responder|responder\s+needed|responder\s+help|need\s+a?\s*responder)\b/,
    /\b(send\s+help|need\s+help|emergency\s+assistance|dispatch\s+a?\s*responder|ambulance)\b/,
    /\b(sprain|twisted\s+ankle|ankle\s+injury|leg\s+injury|arm\s+injury|head\s+injury|injur(y|ed|ies))\b/,
    /\b(slip(ped)?|fell(\s+down)?|fall(en)?|unable\s+to\s+(get\s+up|walk|stand|move))\b/,
    /\b(fracture|broken\s+bone|cut|wound|bleed(ing)?|burn(t)?|severe\s+pain|hurt)\b/,
    /\b(fire|smoke|accident|crash|crime|robbery|assault|safety\s+threat|attack|danger)\b/,
  ];

  const hasAssistanceIntent = assistancePatterns.some((pattern) => pattern.test(combinedText));

  if (hasAssistanceIntent && !isExplicitNonAssistance) {
    return true;
  }

  if (isExplicitNonAssistance) {
    return false;
  }

  if (/\b(require(s)?\s+(standard\s+)?medical\s+assistance|need(s)?\s+(medical\s+)?assistance|responder)\b/i.test(classification.reason || '')) {
    return true;
  }

  return false;
}

function createSarvamEmergencyHandler({ getDatabase = getDB, classify = classifyEmergency } = {}) {
  return asyncHandler(async (req, res) => {
    const body = req.body;
    const validationError = validateEmergencyPayload(body);
    if (validationError) return error(res, 400, validationError);

    const interactionId = body.interaction_id.trim();
    logger.info(`[SARVAM] interaction received: interaction_id=${interactionId}`);
    logger.info(`[SARVAM] emergency tool called: interaction_id=${interactionId}, emergency_type=${body.emergency_type}, severity=${body.severity}`);

    const db = getDatabase();
    const requests = db.collection('assistance_requests');
    await ensureInteractionIndex(requests);

    const existing = await requests.findOne({ interaction_id: interactionId });
    if (existing) return error(res, 409, 'This Sarvam interaction has already created an emergency request.');

    try {
      const classification = validateClassification(await classify({
        conversation_text: body.description.trim(),
        emergency_type: body.emergency_type,
        location: body.location.trim(),
        description: body.description.trim(),
        caller_phone: body.caller_phone.trim(),
      }));

      logger.info(`[GEMINI] classification completed: interaction_id=${interactionId}, is_emergency=${classification.is_emergency}, disposition=${classification.disposition}, emergency_type=${classification.emergency_type}, severity=${classification.severity}`);

      if (classification.disposition === 'unclear') {
        return success(res, 200, {
          is_emergency: false,
          disposition: 'unclear',
          message: 'The interaction requires clarification before an emergency request can be created.',
          classification,
        });
      }

      const genuineAssistance = isGenuineAssistanceRequest(classification, body);

      if (!genuineAssistance) {
        return success(res, 200, {
          is_emergency: false,
          disposition: 'non_emergency',
          message: 'The interaction was classified as a non-emergency.',
          classification,
        });
      }

      const resolvedSeverity = classification.severity || body.severity?.toLowerCase() || 'low';
      const resolvedEmergencyType = classification.emergency_type || body.emergency_type?.toLowerCase() || 'other';

      const request = await createRequest(db, {
        category: categoryByEmergencyType[resolvedEmergencyType] || 'other',
        urgencyLevel: urgencyBySeverity[resolvedSeverity] || 'routine',
        aiConfidence: 1,
        description: `${body.description.trim()}\n\nGemini classification: ${classification.reason}`,
        locationText: body.location.trim(),
        location: body.location.trim(),
        sourceChannel: 'sarvam_voice_agent',
        seniorCitizenPhone: body.caller_phone.trim(),
        extraFields: {
          interaction_id: interactionId,
          emergency_type: resolvedEmergencyType,
          sarvam_emergency_type: resolvedEmergencyType,
          severity: resolvedSeverity,
          sarvam_severity: resolvedSeverity,
          is_emergency: true,
          disposition: 'emergency',
          caller_phone: body.caller_phone.trim(),
          location: body.location.trim(),
        },
        metadata: {
          source: 'sarvam_voice_agent',
          interaction_id: interactionId,
          is_emergency: true,
          disposition: 'emergency',
        },
        creationReason: 'Emergency request created by Sarvam Voice Agent.',
        escalationType: resolvedEmergencyType,
      }, { role: 'sarvam_voice_agent', source: 'sarvam_voice_agent' });

      logger.info(`[REQUEST] emergency request created: request_id=${request._id}, status=${request.status}, interaction_id=${interactionId}`);

      return success(res, 201, {
        request_id: request._id,
        status: request.status,
        message: 'Emergency request created successfully',
      });
    } catch (creationError) {
      if (creationError?.code === 11000) {
        return error(res, 409, 'This Sarvam interaction has already created an emergency request.');
      }
      if (creationError instanceof GeminiClassificationError) {
        return error(res, 502, creationError.message);
      }
      throw creationError;
    }
  });
}

router.post('/emergency', requireSarvamToolAuthentication, createSarvamEmergencyHandler());

module.exports = router;
module.exports.createSarvamEmergencyHandler = createSarvamEmergencyHandler;
module.exports.requireSarvamToolAuthentication = requireSarvamToolAuthentication;
module.exports.validateEmergencyPayload = validateEmergencyPayload;
module.exports.isGenuineAssistanceRequest = isGenuineAssistanceRequest;
