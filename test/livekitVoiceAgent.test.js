'use strict';

/**
 * test/livekitVoiceAgent.test.js
 *
 * Automated tests for Sahayak LiveKit Voice Agent:
 * - agent initialization/configuration
 * - missing environment variables
 * - emergency information extraction (SIP attributes, metadata, identity)
 * - createEmergencyRequest tool validation
 * - backend authentication (Bearer token)
 * - backend error handling
 * - no secret leakage
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { isAgent } = require('@livekit/agents');
const {
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
} = require('../src/services/livekitVoiceAgentService');

describe('Sahayak LiveKit Voice Agent', () => {

  // 1. Configuration & Environment Validation
  describe('Environment & Configuration', () => {
    test('throws LiveKitEnvError listing all missing environment variables', () => {
      assert.throws(
        () => validateLiveKitEnv({}),
        (err) => {
          assert(err instanceof LiveKitEnvError);
          assert(err.missingVars.includes('LIVEKIT_URL'));
          assert(err.missingVars.includes('LIVEKIT_API_KEY'));
          assert(err.missingVars.includes('LIVEKIT_API_SECRET'));
          assert(err.missingVars.includes('GEMINI_API_KEY'));
          assert(err.missingVars.includes('SAHAYAK_TOOL_SHARED_SECRET'));
          return true;
        }
      );
    });

    test('accepts valid configuration and normalizes URLs and secrets', () => {
      const mockEnv = {
        LIVEKIT_URL: 'wss://sahayak-test.livekit.cloud',
        LIVEKIT_API_KEY: 'test-api-key',
        LIVEKIT_API_SECRET: 'test-api-secret',
        GEMINI_API_KEY: 'test-gemini-key',
        SAHAYAK_BACKEND_URL: 'http://127.0.0.1:5000/',
        SAHAYAK_TOOL_SHARED_SECRET: 'super-secret-token-1234',
      };

      const result = validateLiveKitEnv(mockEnv);
      assert.equal(result.valid, true);
      assert.equal(result.config.livekitUrl, 'wss://sahayak-test.livekit.cloud');
      assert.equal(result.config.sahayakBackendUrl, 'http://127.0.0.1:5000');
      assert.equal(result.config.sahayakToolSharedSecret, 'super-secret-token-1234');
    });

    test('falls back to SARVAM_TOOL_SHARED_SECRET when SAHAYAK_TOOL_SHARED_SECRET is absent', () => {
      const mockEnv = {
        LIVEKIT_URL: 'wss://sahayak-test.livekit.cloud',
        LIVEKIT_API_KEY: 'test-api-key',
        LIVEKIT_API_SECRET: 'test-api-secret',
        GEMINI_API_KEY: 'test-gemini-key',
        PORT: '5000',
        SARVAM_TOOL_SHARED_SECRET: 'fallback-shared-secret-5678',
      };

      const result = validateLiveKitEnv(mockEnv);
      assert.equal(result.valid, true);
      assert.equal(result.config.sahayakToolSharedSecret, 'fallback-shared-secret-5678');
      assert.equal(result.config.sahayakBackendUrl, 'http://localhost:5000');
    });
  });

  // 2. Agent Initialization & Tooling
  describe('Agent Initialization & Instructions', () => {
    test('createLiveKitAgent returns a valid LiveKit agent definition', () => {
      const agent = createLiveKitAgent({
        backendUrl: 'http://localhost:5000',
        sharedSecret: 'test-secret',
        geminiApiKey: 'test-key',
      });

      assert.equal(isAgent(agent), true);
      assert.equal(typeof agent.entry, 'function');
    });

    test('createEmergencyRequestTool provides correct metadata and schema', () => {
      const tool = createEmergencyRequestTool();
      assert.equal(tool.name, 'createEmergencyRequest');
      assert(tool.description.includes('Sahayak backend'));
      assert.equal(typeof tool.execute, 'function');
    });

    test('getAgentInstructions enforces location accuracy, greeting, confirmation, and correction handling', () => {
      const instructionsWithoutPhone = getAgentInstructions();
      assert(instructionsWithoutPhone.includes('Sahayak Emergency Assistance. What is your emergency?'));
      assert(instructionsWithoutPhone.includes('NEVER invent, assume, or use placeholder/default locations'));
      assert(instructionsWithoutPhone.includes('Mandatory Confirmation Before Dispatch'));
      assert(instructionsWithoutPhone.includes('Handling Corrections and Contradictions'));
      assert(instructionsWithoutPhone.includes('Never submit after a negative response'));
      assert(instructionsWithoutPhone.includes('You MUST ask for their contact phone number'));

      const instructionsWithPhone = getAgentInstructions({ callerPhone: '+919876543210' });
      assert(instructionsWithPhone.includes('+919876543210'));
      assert(instructionsWithPhone.includes('caller\'s verified phone number from telephony metadata'));
    });

    test('createEmergencyRequestTool uses sessionInteractionId across repeated calls', async () => {
      let callCount = 0;
      const capturedPayloads = [];
      const mockFetch = async (url, options) => {
        callCount++;
        capturedPayloads.push(JSON.parse(options.body));
        return {
          status: callCount === 1 ? 201 : 409,
          json: async () => callCount === 1
            ? { success: true, data: { request_id: 'req_1', status: 'pending_assignment' } }
            : { success: false, message: 'Duplicate' },
        };
      };

      const tool = createEmergencyRequestTool({
        backendUrl: 'http://localhost:5000',
        sharedSecret: 'test-secret',
        sessionInteractionId: 'livekit_room_room123',
        fetchImpl: mockFetch,
      });

      const args = {
        caller_phone: '+919876543210',
        emergency_type: 'medical',
        location: 'MG Road Metro Station',
        description: 'Breathing difficulty',
        severity: 'high',
      };

      const res1 = await tool.execute(args);
      const res2 = await tool.execute(args);

      assert.equal(capturedPayloads.length, 2);
      assert.equal(capturedPayloads[0].interaction_id, 'livekit_room_room123');
      assert.equal(capturedPayloads[1].interaction_id, 'livekit_room_room123');
      assert.equal(res1.success, true);
      assert.equal(res2.success, true);
    });
  });

  // 3. Caller Phone & SIP Telephony Extraction
  describe('Telephony & Participant Phone Extraction', () => {
    test('extracts phone from sip.phoneNumber attribute', () => {
      const participant = {
        attributes: {
          'sip.phoneNumber': '+919876543210',
        },
      };
      assert.equal(extractCallerPhone(participant), '+919876543210');
    });

    test('extracts phone from sip.from URI', () => {
      const participant = {
        attributes: {
          'sip.from': 'sip:+919876543211@telephony.livekit.cloud',
        },
      };
      assert.equal(extractCallerPhone(participant), '+919876543211');
    });

    test('extracts phone from JSON metadata', () => {
      const participant = {
        metadata: JSON.stringify({ phoneNumber: '+919876543212' }),
      };
      assert.equal(extractCallerPhone(participant), '+919876543212');
    });

    test('extracts phone from plain text metadata', () => {
      const participant = {
        metadata: 'Caller phone: +919876543213',
      };
      assert.equal(extractCallerPhone(participant), '+919876543213');
    });

    test('extracts phone from participant identity if numeric', () => {
      const participant = {
        identity: '+919876543214',
      };
      assert.equal(extractCallerPhone(participant), '+919876543214');
    });

    test('returns null when caller phone cannot be determined', () => {
      const participant = {
        identity: 'browser_user_abc123',
        attributes: {},
        metadata: '',
      };
      assert.equal(extractCallerPhone(participant), null);
      assert.equal(extractCallerPhone(null), null);
    });
  });

  // 4. createEmergencyRequest Tool Argument Validation
  describe('Tool Argument Validation', () => {
    test('validates correct emergency request payload', () => {
      const validArgs = {
        caller_phone: '+919876543210',
        emergency_type: 'medical',
        location: 'Flat 402, Shanti Niketan, Indiranagar, Bengaluru',
        description: 'Elderly lady fell in bathroom, unable to get up, conscious.',
        severity: 'high',
      };

      const res = validateCreateEmergencyRequestArgs(validArgs);
      assert.equal(res.valid, true);
      assert.equal(res.value.emergency_type, 'medical');
      assert.equal(res.value.severity, 'high');
      assert.equal(res.value.caller_phone, '+919876543210');
    });

    test('rejects missing or empty caller_phone', () => {
      const res = validateCreateEmergencyRequestArgs({
        caller_phone: '',
        emergency_type: 'medical',
        location: 'Bengaluru',
        description: 'Chest pain',
        severity: 'critical',
      });
      assert.equal(res.valid, false);
      assert(res.error.includes('caller_phone'));
    });

    test('rejects invalid emergency_type', () => {
      const res = validateCreateEmergencyRequestArgs({
        caller_phone: '+919876543210',
        emergency_type: 'nuclear_attack',
        location: 'Bengaluru',
        description: 'Hazard',
        severity: 'critical',
      });
      assert.equal(res.valid, false);
      assert(res.error.includes('emergency_type'));
    });

    test('rejects missing location', () => {
      const res = validateCreateEmergencyRequestArgs({
        caller_phone: '+919876543210',
        emergency_type: 'fire',
        location: '   ',
        description: 'Smoke in kitchen',
        severity: 'high',
      });
      assert.equal(res.valid, false);
      assert(res.error.includes('location'));
    });

    test('rejects placeholder/invented locations (e.g. Unknown Location, Voice Caller Location)', () => {
      const placeholders = [
        'Unknown Location',
        'voice caller location',
        'Current Location',
        'unknown',
        'not provided',
        'n/a',
      ];
      for (const loc of placeholders) {
        const res = validateCreateEmergencyRequestArgs({
          caller_phone: '+919876543210',
          emergency_type: 'medical',
          location: loc,
          description: 'Fell down',
          severity: 'medium',
        });
        assert.equal(res.valid, false, `Expected "${loc}" to be rejected`);
        assert(res.error.includes('Placeholder') || res.error.includes('location'));
      }
    });

    test('rejects missing description', () => {
      const res = validateCreateEmergencyRequestArgs({
        caller_phone: '+919876543210',
        emergency_type: 'accident',
        location: 'Ring Road',
        description: '',
        severity: 'medium',
      });
      assert.equal(res.valid, false);
      assert(res.error.includes('description'));
    });

    test('rejects invalid severity', () => {
      const res = validateCreateEmergencyRequestArgs({
        caller_phone: '+919876543210',
        emergency_type: 'medical',
        location: 'MG Road',
        description: 'Fever',
        severity: 'catastrophic',
      });
      assert.equal(res.valid, false);
      assert(res.error.includes('severity'));
    });
  });

  // 5. Backend HTTP Authentication & Tool Execution
  describe('Backend HTTP Invocation & Authentication', () => {
    test('sends Bearer Authorization and exact structured payload to Sahayak backend', async () => {
      let capturedUrl = null;
      let capturedOptions = null;

      const mockFetch = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return {
          status: 201,
          json: async () => ({
            status: 'success',
            data: {
              request_id: 'req_livekit_test_123',
              status: 'pending_assignment',
            },
          }),
        };
      };

      const sharedSecret = 'test-sahayak-secret-key-999';
      const result = await executeCreateEmergencyRequest(
        {
          caller_phone: '+919876543210',
          emergency_type: 'medical',
          location: '12th Main, HAL 2nd Stage, Indiranagar',
          description: 'Breathing difficulty and chest tightness.',
          severity: 'critical',
          interaction_id: 'livekit_test_session_001',
        },
        {
          backendUrl: 'http://localhost:5000',
          sharedSecret,
          fetchImpl: mockFetch,
        }
      );

      assert.equal(capturedUrl, 'http://localhost:5000/api/v1/sarvam/emergency');
      assert.equal(capturedOptions.method, 'POST');
      assert.equal(capturedOptions.headers['Content-Type'], 'application/json');
      assert.equal(capturedOptions.headers['Authorization'], `Bearer ${sharedSecret}`);

      const body = JSON.parse(capturedOptions.body);
      assert.equal(body.caller_phone, '+919876543210');
      assert.equal(body.emergency_type, 'medical');
      assert.equal(body.location, '12th Main, HAL 2nd Stage, Indiranagar');
      assert.equal(body.description, 'Breathing difficulty and chest tightness.');
      assert.equal(body.severity, 'critical');
      assert.equal(body.interaction_id, 'livekit_test_session_001');

      assert.equal(result.success, true);
      assert.equal(result.request_id, 'req_livekit_test_123');
      assert.equal(result.status, 'pending_assignment');
    });

    test('handles 409 Conflict duplicate gracefully', async () => {
      const mockFetch = async () => ({
        status: 409,
        json: async () => ({
          status: 'error',
          message: 'This Sarvam interaction has already created an emergency request.',
        }),
      });

      const result = await executeCreateEmergencyRequest(
        {
          caller_phone: '+919876543210',
          emergency_type: 'medical',
          location: 'Koramangala 4th Block',
          description: 'Fell down stairs.',
          severity: 'medium',
        },
        {
          backendUrl: 'http://localhost:5000',
          sharedSecret: 'test-secret',
          fetchImpl: mockFetch,
        }
      );

      assert.equal(result.success, true);
      assert(result.message.includes('already been recorded'));
    });

    test('handles backend 401 Unauthorized error without crashing', async () => {
      const mockFetch = async () => ({
        status: 401,
        json: async () => ({
          status: 'error',
          message: 'Authentication required.',
        }),
      });

      const result = await executeCreateEmergencyRequest(
        {
          caller_phone: '+919876543210',
          emergency_type: 'medical',
          location: 'Whitefield',
          description: 'Headache',
          severity: 'low',
        },
        {
          backendUrl: 'http://localhost:5000',
          sharedSecret: 'wrong-secret',
          fetchImpl: mockFetch,
        }
      );

      assert.equal(result.success, false);
      assert.equal(result.error, 'Authentication required.');
    });

    test('handles network failure without throwing unhandled rejection', async () => {
      const mockFetch = async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:5000');
      };

      const result = await executeCreateEmergencyRequest(
        {
          caller_phone: '+919876543210',
          emergency_type: 'fire',
          location: 'Jayanagar',
          description: 'Small electrical fire',
          severity: 'high',
        },
        {
          backendUrl: 'http://localhost:5000',
          sharedSecret: 'test-secret',
          fetchImpl: mockFetch,
        }
      );

      assert.equal(result.success, false);
      assert(result.error.includes('Unable to contact Sahayak emergency backend service'));
    });
  });

  // 6. Secret Redaction & Logging Safety
  describe('Secret Redaction & No Secret Leakage', () => {
    test('redacts plain secrets, Bearer tokens, and URL key params', () => {
      const rawSecret = 'SUPER_SECRET_LIVEKIT_KEY_XYZ123';
      const text1 = `Connecting with Authorization: Bearer ${rawSecret}`;
      const redacted1 = redactSecrets(text1, [rawSecret]);
      assert(!redacted1.includes(rawSecret));
      assert(redacted1.includes('[REDACTED]'));

      const text2 = 'URL with key: https://api.service.com/stream?apiKey=GEMINI_SECRET_ABC789';
      const redacted2 = redactSecrets(text2, ['GEMINI_SECRET_ABC789']);
      assert(!redacted2.includes('GEMINI_SECRET_ABC789'));
      assert(redacted2.includes('apiKey=[REDACTED]'));
    });

    test('logs do not leak sharedSecret or Authorization headers during tool execution', async () => {
      const loggedInfo = [];
      const loggedError = [];
      const mockLogFn = {
        info: (msg) => loggedInfo.push(msg),
        error: (msg) => loggedError.push(msg),
      };

      const secretToProtect = 'ULTRA_SECRET_TOKEN_DO_NOT_LEAK_999';

      const mockFetch = async () => {
        throw new Error(`Failed to authenticate with Bearer ${secretToProtect}`);
      };

      await executeCreateEmergencyRequest(
        {
          caller_phone: '+919876543210',
          emergency_type: 'crime',
          location: 'MG Road Metro Station',
          description: 'Theft reported',
          severity: 'medium',
        },
        {
          backendUrl: 'http://localhost:5000',
          sharedSecret: secretToProtect,
          fetchImpl: mockFetch,
          logFn: mockLogFn,
        }
      );

      const allLogs = [...loggedInfo, ...loggedError].join(' \n ');
      assert(!allLogs.includes(secretToProtect), 'Secret token must never appear in logs!');
      assert(loggedInfo.some((msg) => msg.includes('[LIVEKIT_AGENT] emergency information collected')));
      assert(loggedInfo.some((msg) => msg.includes('[LIVEKIT_AGENT] createEmergencyRequest called')));
      assert(loggedError.some((msg) => msg.includes('[LIVEKIT_AGENT] backend request network error')));
    });
  });
});
