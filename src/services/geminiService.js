const { GoogleGenAI } = require('@google/genai');
const env = require('../config/env');
const logger = require('../utils/logger');
const { EMERGENCY_TYPES } = require('../config/constants');

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const EMERGENCY_TYPES_SET = new Set(EMERGENCY_TYPES);
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const DISPOSITIONS = new Set(['emergency', 'non_emergency', 'unclear']);

const CLASSIFICATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_emergency: { type: 'BOOLEAN' },
    emergency_type: { type: 'STRING', enum: [...EMERGENCY_TYPES] },
    severity: { type: 'STRING', enum: [...SEVERITIES] },
    disposition: { type: 'STRING', enum: [...DISPOSITIONS] },
    reason: { type: 'STRING' },
  },
  required: ['is_emergency', 'emergency_type', 'severity', 'disposition', 'reason'],
};

const SYSTEM_INSTRUCTION = [
  'You are an emergency and assistance intake classifier for the Sahayak emergency-assistance system.',
  'Classify only the supplied conversation and request details. Never invent facts.',
  'Do not provide medical, legal, firefighting, or other emergency advice.',
  'Do not classify something as an emergency merely because the caller is disabled, elderly, alone, poor, anxious, or vulnerable.',
  'Do not classify something as non-emergency merely because the request initially sounds routine or non-life-threatening.',
  'Every genuine assistance or emergency request where the caller needs emergency help, medical assistance, in-person responder dispatch, fall assistance, accident response, fire response, crime response, or safety threat help is an assistance/emergency request: set is_emergency to true and disposition to emergency.',
  'Classify severity accurately as low, medium, high, or critical.',
  'Minor injuries (such as minor ankle sprains, minor slips/falls, minor cuts, or stable callers needing medical assistance or responders) have severity low, but because they are genuine assistance requests, set is_emergency to true and disposition to emergency.',
  'Immediate danger, serious injury, severe symptoms, active fire, accident, crime, safety threat, or another situation requiring urgent response must be classified as severity medium, high, or critical with is_emergency true and disposition emergency.',
  'Routine non-assistance interactions such as routine pharmacy delivery/refill for tomorrow with no immediate danger or acute symptoms, routine appointment booking, ordinary information queries, or conversational chitchat with no need for emergency/responder assistance are non_emergency: set is_emergency to false and disposition to non_emergency.',
  'If information is insufficient to determine emergency status, use disposition unclear and set is_emergency to false.',
  'Never classify something as prank unless the conversation explicitly indicates it is a joke, prank, or false emergency.',
  'A physical disability alone is not evidence of an emergency.',
  'Lack of medication alone is not automatically an emergency. Lack of essential medication combined with immediate danger or urgent symptoms may be an emergency.',
  'Return only JSON matching the requested schema.',
].join('\n');

class GeminiClassificationError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'GeminiClassificationError';
    this.code = 'GEMINI_CLASSIFICATION_ERROR';
    this.cause = cause;
  }
}

function validateClassification(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GeminiClassificationError('Gemini returned an invalid classification object.');
  }
  if (typeof value.is_emergency !== 'boolean') {
    throw new GeminiClassificationError('Gemini returned an invalid emergency decision.');
  }
  if (!EMERGENCY_TYPES_SET.has(value.emergency_type)) {
    throw new GeminiClassificationError('Gemini returned an invalid emergency type.');
  }
  if (!SEVERITIES.has(value.severity)) {
    throw new GeminiClassificationError('Gemini returned an invalid severity.');
  }
  if (!DISPOSITIONS.has(value.disposition)) {
    throw new GeminiClassificationError('Gemini returned an invalid disposition.');
  }
  if (typeof value.reason !== 'string' || !value.reason.trim()) {
    throw new GeminiClassificationError('Gemini returned an invalid classification reason.');
  }

  return {
    is_emergency: value.is_emergency,
    emergency_type: value.emergency_type,
    severity: value.severity,
    disposition: value.disposition,
    reason: value.reason.trim().slice(0, 1000),
  };
}

function buildConversationText(input) {
  const sanitize = (val, max = 2000) => String(val || 'Not provided.').slice(0, max);
  return [
    `Conversation: ${sanitize(input.conversation_text)}`,
    `Emergency type reported: ${sanitize(input.emergency_type, 100)}`,
    `Location: ${sanitize(input.location, 500)}`,
    `Description: ${sanitize(input.description)}`,
    `Caller phone: ${sanitize(input.caller_phone, 50)}`,
  ].join('\n');
}

function safeGeminiErrorDetails(error, model) {
  const details = {
    model,
    structuredOutput: true,
    responseSchemaUsed: true,
    status: error?.status ?? error?.statusCode ?? error?.response?.status ?? 'unavailable',
    name: error?.name || 'unknown',
    message: error?.message || 'unknown',
    response: error?.response?.data ?? error?.response?.body ?? error?.response ?? error?.body ?? error?.error ?? 'unavailable',
  };

  try {
    return JSON.stringify(details, (key, value) => {
      if (/api[_-]?key|authorization|headers?/i.test(key)) return '[redacted]';
      return value;
    });
  } catch (serializationError) {
    return JSON.stringify({
      model,
      structuredOutput: true,
      responseSchemaUsed: true,
      status: details.status,
      name: details.name,
      message: details.message,
      response: '[unserializable]',
      serializationError: serializationError.message,
    });
  }
}

async function classifyEmergency(input) {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  logger.info(`Gemini API key present: ${Boolean(env.GEMINI_API_KEY)}`);
  logger.info(`Gemini API key length: ${env.GEMINI_API_KEY ? env.GEMINI_API_KEY.length : 0}`);
  logger.info(`Gemini model: ${model}`);

  if (!env.GEMINI_API_KEY) {
    logger.error('Gemini request failed. Error name: GeminiClassificationError. Error message: Gemini classification is not configured. Error status/code: GEMINI_CLASSIFICATION_ERROR');
    throw new GeminiClassificationError('Gemini classification is not configured.');
  }

  try {
    logger.info('Gemini request started');
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model,
      contents: buildConversationText(input),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: CLASSIFICATION_SCHEMA,
        temperature: 0,
      },
    });
    logger.info('Gemini request succeeded');

    let parsed;
    try {
      parsed = JSON.parse(response.text || '');
    } catch (parseError) {
      throw new GeminiClassificationError('Gemini returned malformed JSON.', parseError);
    }
    return validateClassification(parsed);
  } catch (error) {
    logger.error(`Gemini request failed: ${safeGeminiErrorDetails(error, model)}`);
    if (error instanceof GeminiClassificationError) throw error;
    throw new GeminiClassificationError('Gemini classification failed.', error);
  }
}

module.exports = {
  CLASSIFICATION_SCHEMA,
  DEFAULT_MODEL,
  GeminiClassificationError,
  classifyEmergency,
  validateClassification,
};
