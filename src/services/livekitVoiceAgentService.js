'use strict';

/**
 * livekitVoiceAgentService.js
 *
 * Isolated LiveKit Voice Agent service for Sahayak emergency assistance.
 * Connects LiveKit Cloud WebRTC voice rooms to Google Gemini Multimodal Live,
 * collects emergency details, confirms with the caller, and calls the
 * authoritative Sahayak backend API via the controlled createEmergencyRequest tool.
 *
 * Architecture:
 * Phone/Browser -> LiveKit -> Sahayak LiveKit Agent -> Gemini -> createEmergencyRequest -> Sahayak Backend API -> MongoDB
 */

const crypto = require('crypto');
const { z } = require('zod');
const { initializeLogger, voice, llm, defineAgent } = require('@livekit/agents');
const google = require('@livekit/agents-plugin-google');
const logger = require('../utils/logger');
const env = require('../config/env');

// Supported enums matching Sahayak backend routes
const VALID_EMERGENCY_TYPES = ['medical', 'fire', 'accident', 'crime', 'safety_threat', 'other'];
const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];

/**
 * Custom error for missing LiveKit environment variables.
 */
class LiveKitEnvError extends Error {
  constructor(missingVars) {
    super(`Missing required LiveKit environment variable(s): ${missingVars.join(', ')}`);
    this.name = 'LiveKitEnvError';
    this.missingVars = missingVars;
  }
}

/**
 * Validates that all required environment variables for LiveKit Voice Agent are present.
 * @param {Record<string, string|undefined>} [envVars=process.env]
 * @returns {{ valid: boolean, config: object }}
 */
function validateLiveKitEnv(envVars = process.env) {
  const required = [
    'LIVEKIT_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
    'GEMINI_API_KEY',
  ];

  const missing = required.filter((key) => !envVars[key] || !String(envVars[key]).trim());

  const backendUrl = envVars.SAHAYAK_BACKEND_URL || (envVars.PORT ? `http://localhost:${envVars.PORT}` : 'http://localhost:5000');
  const sharedSecret = envVars.SAHAYAK_TOOL_SHARED_SECRET || envVars.SARVAM_TOOL_SHARED_SECRET;

  if (!backendUrl || !String(backendUrl).trim()) {
    missing.push('SAHAYAK_BACKEND_URL');
  }
  if (!sharedSecret || !String(sharedSecret).trim()) {
    missing.push('SAHAYAK_TOOL_SHARED_SECRET');
  }

  if (missing.length > 0) {
    throw new LiveKitEnvError(missing);
  }

  return {
    valid: true,
    config: {
      livekitUrl: envVars.LIVEKIT_URL,
      livekitApiKey: envVars.LIVEKIT_API_KEY,
      livekitApiSecret: envVars.LIVEKIT_API_SECRET,
      geminiApiKey: envVars.GEMINI_API_KEY,
      sahayakBackendUrl: backendUrl.replace(/\/+$/, ''),
      sahayakToolSharedSecret: sharedSecret,
    },
  };
}

/**
 * Safely redacts secrets and bearer tokens from logs and messages.
 * @param {string} text
 * @param {string[]} [secrets=[]]
 * @returns {string}
 */
function redactSecrets(text, secrets = []) {
  if (typeof text !== 'string') return String(text ?? '');
  let sanitized = text;

  // Redact explicit secrets
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.trim().length >= 4) {
      sanitized = sanitized.split(secret).join('[REDACTED]');
    }
  }

  // Redact Bearer headers and auth tokens
  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer [REDACTED]');
  sanitized = sanitized.replace(/([?&](?:apiKey|key|token|secret)=)[^&]+/gi, '$1[REDACTED]');

  return sanitized;
}

/**
 * Extracts caller phone number from LiveKit participant metadata, SIP attributes, or identity.
 * @param {object} participant - LiveKit remote participant object
 * @returns {string|null} - Normalized phone string or null if not available
 */
function extractCallerPhone(participant) {
  if (!participant) return null;

  const phoneRegex = /\+?[0-9]{10,15}/;

  // 1. Check SIP attributes if joined via SIP trunk
  const attrs = participant.attributes || {};
  if (typeof attrs === 'object') {
    const candidateKeys = [
      'sip.phoneNumber',
      'sip.callerId',
      'sip.from',
      'phone',
      'caller_phone',
      'callerPhone',
      'caller_id',
    ];
    for (const key of candidateKeys) {
      const val = attrs[key];
      if (typeof val === 'string' && val.trim()) {
        const match = val.match(phoneRegex);
        if (match) return match[0];
      }
    }
  }

  // 2. Check participant metadata (JSON string or plain text)
  if (typeof participant.metadata === 'string' && participant.metadata.trim()) {
    try {
      const parsed = JSON.parse(participant.metadata);
      if (typeof parsed === 'object' && parsed !== null) {
        for (const key of ['phoneNumber', 'phone', 'caller_phone', 'callerPhone', 'caller_id']) {
          if (typeof parsed[key] === 'string') {
            const match = parsed[key].match(phoneRegex);
            if (match) return match[0];
          }
        }
      }
    } catch {
      const match = participant.metadata.match(phoneRegex);
      if (match) return match[0];
    }
  }

  // 3. Check participant identity
  if (typeof participant.identity === 'string' && participant.identity.trim()) {
    const match = participant.identity.match(phoneRegex);
    if (match) return match[0];
  }

  return null;
}

/**
 * Zod schema for createEmergencyRequest tool arguments.
 */
const CreateEmergencyRequestSchema = z.object({
  caller_phone: z.string().min(5).describe("The caller's contact phone number in E.164 or 10-digit format (e.g. +919876543210)"),
  emergency_type: z.enum(['medical', 'fire', 'accident', 'crime', 'safety_threat', 'other']).describe("Classification of the emergency"),
  location: z.string().min(3).describe("Exact physical address, landmark, building, or location of the emergency"),
  description: z.string().min(3).describe("Detailed summary of the emergency situation and symptoms or hazards"),
  severity: z.enum(['low', 'medium', 'high', 'critical']).describe("Assessed severity of the situation"),
  interaction_id: z.string().optional().describe("Optional unique interaction identifier"),
});

/**
 * Validates createEmergencyRequest arguments directly.
 * @param {object} args
 * @returns {{ valid: boolean, error?: string, value?: object }}
 */
function validateCreateEmergencyRequestArgs(args) {
  if (!args || typeof args !== 'object') {
    return { valid: false, error: 'Arguments object is required.' };
  }

  const { caller_phone, emergency_type, location, description, severity } = args;

  if (!caller_phone || typeof caller_phone !== 'string' || !caller_phone.trim()) {
    return { valid: false, error: 'caller_phone is required and must be a non-empty string.' };
  }

  if (!emergency_type || typeof emergency_type !== 'string') {
    return { valid: false, error: 'emergency_type is required.' };
  }
  const normalizedType = emergency_type.trim().toLowerCase().replace(/\s+/g, '_');
  if (!VALID_EMERGENCY_TYPES.includes(normalizedType)) {
    return {
      valid: false,
      error: `Invalid emergency_type: "${emergency_type}". Must be one of: ${VALID_EMERGENCY_TYPES.join(', ')}`,
    };
  }

  if (!location || typeof location !== 'string' || !location.trim()) {
    return { valid: false, error: 'location is required and must specify where help is needed.' };
  }
  const normalizedLoc = location.trim().toLowerCase();
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
  if (FORBIDDEN_LOCATIONS.has(normalizedLoc)) {
    return {
      valid: false,
      error: 'A specific physical location or landmark is required. Placeholder locations like "Unknown Location" or "Voice Caller Location" are not allowed.',
    };
  }

  if (!description || typeof description !== 'string' || !description.trim()) {
    return { valid: false, error: 'description is required and must describe what happened.' };
  }

  if (!severity || typeof severity !== 'string') {
    return { valid: false, error: 'severity is required.' };
  }
  const normalizedSeverity = severity.trim().toLowerCase();
  if (!VALID_SEVERITIES.includes(normalizedSeverity)) {
    return {
      valid: false,
      error: `Invalid severity: "${severity}". Must be one of: ${VALID_SEVERITIES.join(', ')}`,
    };
  }

  return {
    valid: true,
    value: {
      caller_phone: caller_phone.trim(),
      emergency_type: normalizedType,
      location: location.trim(),
      description: description.trim(),
      severity: normalizedSeverity,
      interaction_id: args.interaction_id?.trim() || null,
    },
  };
}

/**
 * Executes the createEmergencyRequest HTTP call to the authoritative Sahayak backend.
 * Never accesses MongoDB directly.
 *
 * @param {object} args - { caller_phone, emergency_type, location, description, severity, interaction_id }
 * @param {object} options - { backendUrl, sharedSecret, fetchImpl, logFn }
 * @returns {Promise<object>}
 */
async function executeCreateEmergencyRequest(args, options = {}) {
  const backendUrl = (options.backendUrl || env.SAHAYAK_BACKEND_URL || 'http://localhost:5000').replace(/\/+$/, '');
  const sharedSecret = options.sharedSecret || env.SAHAYAK_TOOL_SHARED_SECRET || env.SARVAM_TOOL_SHARED_SECRET;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const logInfo = options.logFn?.info || logger.info;
  const logError = options.logFn?.error || logger.error;

  const validation = validateCreateEmergencyRequestArgs(args);
  if (!validation.valid) {
    logError(`[LIVEKIT_AGENT] createEmergencyRequest validation failed: ${validation.error}`);
    return {
      success: false,
      error: validation.error,
    };
  }

  const { caller_phone, emergency_type, location, description, severity } = validation.value;
  const interactionId = validation.value.interaction_id || `livekit_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  // Log emergency info collected & tool call
  logInfo(`[LIVEKIT_AGENT] emergency information collected: emergency_type=${emergency_type}, severity=${severity}, location=${location}, phone=${caller_phone}`);
  logInfo(`[LIVEKIT_AGENT] createEmergencyRequest called: interaction_id=${interactionId}`);

  const endpoint = `${backendUrl}/api/v1/sarvam/emergency`;
  const payload = {
    caller_phone,
    interaction_id: interactionId,
    emergency_type,
    location,
    description,
    severity,
  };

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sharedSecret}`,
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.json().catch(() => null);

    if (response.status === 201) {
      const requestId = responseBody?.data?.request_id || responseBody?.request_id || 'unknown';
      const status = responseBody?.data?.status || responseBody?.status || 'pending_assignment';
      logInfo(`[LIVEKIT_AGENT] backend request created: request_id=${requestId}, status=${status}`);
      return {
        success: true,
        request_id: requestId,
        status,
        message: 'Emergency request created successfully and dispatched to Sahayak responders.',
      };
    }

    if (response.status === 409) {
      logInfo(`[LIVEKIT_AGENT] duplicate emergency request: interaction_id=${interactionId}`);
      return {
        success: true,
        message: 'This emergency request has already been recorded and is currently being processed.',
      };
    }

    if (response.status === 200 && responseBody?.data?.disposition) {
      // Gemini classified as non_emergency or unclear
      const disposition = responseBody.data.disposition;
      logInfo(`[LIVEKIT_AGENT] backend evaluated non-emergency: disposition=${disposition}`);
      return {
        success: false,
        disposition,
        message: responseBody.data.message || `Assessed as ${disposition}.`,
      };
    }

    const errorMsg = responseBody?.error?.message || responseBody?.message || `Backend responded with HTTP ${response.status}`;
    logError(`[LIVEKIT_AGENT] backend request failed: status=${response.status}`);
    return {
      success: false,
      error: errorMsg,
    };
  } catch (err) {
    const sanitizedError = redactSecrets(err?.message || 'Network error', [sharedSecret]);
    logError(`[LIVEKIT_AGENT] backend request network error: ${sanitizedError}`);
    return {
      success: false,
      error: 'Unable to contact Sahayak emergency backend service.',
    };
  }
}

/**
 * Creates the controlled LiveKit LLM tool for createEmergencyRequest.
 * Exposes ONLY this tool to the LLM.
 *
 * @param {object} options - { backendUrl, sharedSecret, fetchImpl }
 * @returns {object} - LiveKit function tool
 */
function createEmergencyRequestTool(options = {}) {
  return llm.tool({
    name: 'createEmergencyRequest',
    description: 'Dispatch an emergency request to the Sahayak backend after collecting and confirming emergency details with the caller.',
    parameters: CreateEmergencyRequestSchema,
    execute: async (args) => {
      const mergedArgs = {
        ...args,
        interaction_id: args.interaction_id || options.interactionId || options.sessionInteractionId || undefined,
      };
      return executeCreateEmergencyRequest(mergedArgs, options);
    },
  });
}

/**
 * Returns system instructions for the LiveKit Gemini voice agent.
 * @param {object} [context={}]
 * @param {string|null} [context.callerPhone=null]
 * @returns {string}
 */
function getAgentInstructions({ callerPhone = null } = {}) {
  const phoneContext = callerPhone
    ? `The caller's verified phone number from telephony metadata is ${callerPhone}. You do not need to ask for their phone number unless they wish to provide a different contact.`
    : `The caller's phone number is not available in call metadata. You MUST ask for their contact phone number.`;

  return `
You are Sahayak, an AI emergency dispatch assistant for senior citizens and emergency callers in India.
Your mission is to quickly, calmly, and accurately collect essential emergency information and dispatch help.

Core Behavioral Principles:
1. Tone: Calm, urgent, empathetic, reassuring, and concise. Do not use conversational filler, disclaimers, or excessive chatter.
2. Opening: Greet the caller immediately: "Sahayak Emergency Assistance. What is your emergency?"
3. Essential Information to Collect:
   - What happened (incident details: medical injury/illness, fire, accident/fall, crime, or safety threat).
   - Exact Physical Location: Street address, landmark, building, apartment number, or village/city.
     CRITICAL LOCATION RULE: Location is MANDATORY. NEVER invent, assume, or use placeholder/default locations (e.g., "Voice Caller Location", "Unknown Location", "Current Location", "Near the road", "At home"). If the location is missing or ambiguous, ask for clarification: "Could you please give me your exact address or a nearby landmark so our response team can reach you?" Do NOT call createEmergencyRequest until a usable, specific physical location is confirmed.
   - Contact Phone: ${phoneContext}
4. Handling Corrections and Contradictions:
   - If the caller changes the emergency description, location, or details, or provides contradictory information (e.g., switches from a car accident to a broken leg), treat the newest stated information as an intentional correction, but explicitly clarify and confirm the updated situation before dispatching help (e.g., "You previously mentioned a car accident, but now mentioned a broken leg. Just to be certain, are you in need of medical help for a broken leg?").
5. Mandatory Confirmation Before Dispatch:
   - BEFORE calling the "createEmergencyRequest" tool, you MUST summarize and confirm the details with the caller:
     "I am dispatching emergency help for [brief summary] at [exact location]. Is this correct?"
   - Only call "createEmergencyRequest" when the caller gives confirmation (e.g. "yes", "correct", "please hurry", or equivalent affirmative).
   - If the caller says "no" or indicates any detail is wrong: DO NOT call createEmergencyRequest. Instead ask: "What detail needs to be corrected?" Update your information and confirm again. Never submit after a negative response.
6. Create Emergency Request:
   - When confirmed, call the createEmergencyRequest tool with:
     - caller_phone: Caller phone number
     - emergency_type: 'medical' | 'fire' | 'accident' | 'crime' | 'safety_threat' | 'other'
     - location: Confirmed exact location (never a placeholder)
     - description: Concise summary of emergency and caller state
     - severity: 'low' | 'medium' | 'high' | 'critical'
7. Post-Dispatch Reassurance:
   - When the tool returns success, immediately tell the caller:
     "Help has been dispatched to your location. Please stay calm and remain in a safe place. A responder will reach out to you shortly."
`.trim();
}

/**
 * Configures and returns the LiveKit agent entry function.
 * @param {object} [options={}]
 * @returns {object} - LiveKit AgentDefinition
 */
function createLiveKitAgent(options = {}) {
  // Ensure LiveKit logger is initialized
  try {
    initializeLogger({ pretty: true, level: options.logLevel || 'info' });
  } catch {
    // Already initialized
  }

  const backendUrl = options.backendUrl || env.SAHAYAK_BACKEND_URL;
  const sharedSecret = options.sharedSecret || env.SAHAYAK_TOOL_SHARED_SECRET || env.SARVAM_TOOL_SHARED_SECRET;
  const geminiApiKey = options.geminiApiKey || env.GEMINI_API_KEY;
  const geminiModel = options.geminiModel || 'gemini-2.0-flash-exp';

  return defineAgent({
    entry: async (ctx) => {
      logger.info('[LIVEKIT_AGENT] connecting to room...');
      await ctx.connect();
      logger.info(`[LIVEKIT_AGENT] connected: room=${ctx.room.name}`);

      let detectedPhone = null;

      // Extract phone from existing remote participants if any
      for (const participant of ctx.room.remoteParticipants.values()) {
        const phone = extractCallerPhone(participant);
        if (phone) {
          detectedPhone = phone;
          logger.info(`[LIVEKIT_AGENT] caller phone detected from metadata: ${detectedPhone}`);
          break;
        }
      }

      const roomInteractionId = `livekit_${ctx.room.name || Date.now()}`;
      const emergencyTool = createEmergencyRequestTool({
        backendUrl,
        sharedSecret,
        fetchImpl: options.fetchImpl,
        sessionInteractionId: roomInteractionId,
      });

      // Configure Gemini Multimodal Live model
      const realtimeModel = new google.realtime.RealtimeModel({
        model: geminiModel,
        apiKey: geminiApiKey,
        voice: options.voice || 'Aoede',
        temperature: 0.2,
      });

      // Construct Voice Agent
      const agent = new voice.Agent({
        instructions: getAgentInstructions({ callerPhone: detectedPhone }),
        tools: [emergencyTool],
      });

      // Construct AgentSession
      const session = new voice.AgentSession({
        llm: realtimeModel,
      });

      // Track transcripts
      session.on('user_input_transcribed', (event) => {
        if (event && event.transcript) {
          logger.info(`[LIVEKIT_AGENT] transcript received: "${event.transcript}"`);
        }
      });

      // Track session end
      session.on('close', (event) => {
        logger.info(`[LIVEKIT_AGENT] session ended: reason=${event?.reason || 'normal'}`);
      });

      // Listen for participants joining
      ctx.room.on('participantConnected', (participant) => {
        logger.info(`[LIVEKIT_AGENT] participant joined: identity=${participant.identity}`);
        if (!detectedPhone) {
          const phone = extractCallerPhone(participant);
          if (phone) {
            detectedPhone = phone;
            logger.info(`[LIVEKIT_AGENT] caller phone detected from metadata: ${detectedPhone}`);
          }
        }
      });

      // Start the voice session in the room
      await session.start({
        agent,
        room: ctx.room,
      });

      // Greet the caller
      try {
        session.say('Sahayak Emergency Assistance. What is your emergency?');
      } catch (err) {
        logger.warn(`[LIVEKIT_AGENT] initial greeting warning: ${err?.message}`);
      }
    },
  });
}

module.exports = {
  createLiveKitAgent,
  createEmergencyRequestTool,
  executeCreateEmergencyRequest,
  extractCallerPhone,
  getAgentInstructions,
  redactSecrets,
  validateCreateEmergencyRequestArgs,
  validateLiveKitEnv,
  LiveKitEnvError,
  VALID_EMERGENCY_TYPES,
  VALID_SEVERITIES,
};
