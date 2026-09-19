const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

function decideRequest(classification = {}) {
  const urgency = classification.urgency || classification.urgency_level || 'routine';
  const confidence = Number(classification.ai_confidence ?? classification.confidence ?? 1);
  const emergency = urgency === 'critical' || confidence < DEFAULT_CONFIDENCE_THRESHOLD;

  return {
    emergency,
    allowVolunteerAssignment: !emergency,
    confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
  };
}

module.exports = { decideRequest, DEFAULT_CONFIDENCE_THRESHOLD };
