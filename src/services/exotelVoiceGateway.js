/**
 * exotelVoiceGateway.js
 * Exotel WebSocket Voice Gateway for Sahayak.
 *
 * Architecture:
 * Phone -> Exotel -> WebSocket /ws -> Sarvam Realtime STT -> Sahayak Conversation
 * -> Sarvam Realtime TTS -> POST /api/v1/sarvam/emergency -> Gemini Classification -> MongoDB
 */

const WebSocket = require('ws');
const env = require('../config/env');
const logger = require('../utils/logger');
const { createSarvamVoiceAgentSession } = require('./sarvamVoiceAgentService');
const { isValidBasicAuthorization } = require('../utils/providerAuthentication');

const EXOTEL_EVENTS = new Set(['connected', 'start', 'media', 'dtmf', 'stop', 'mark', 'clear']);
const GREETING_PROMPT = 'Hello, this is Sahayak Emergency Assistance. Please tell me what happened and where you are.';
const LOCATION_PROMPT = 'Please tell me your location.';
const CONFIRMATION_MESSAGE = 'Your emergency has been registered. Help is being coordinated. Please stay on the line.';
const FAILURE_MESSAGE = 'Sorry, I could not register the emergency. Please stay on the line.';
const OPENING_GREETING = GREETING_PROMPT;
const VOICE_RESPONSE = CONFIRMATION_MESSAGE;
const EXOTEL_SAMPLE_RATE = 8000;
const SARVAM_OUTPUT_SAMPLE_RATE = 16000;

function isBase64(value) {
  return typeof value === 'string' && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}

function sendJson(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function sendAudio(socket, streamSid, audio) {
  sendJson(socket, {
    event: 'media',
    stream_sid: streamSid,
    media: { payload: audio.toString('base64') },
  });
}

function resamplePcm16le(audio, inputRate, outputRate = EXOTEL_SAMPLE_RATE) {
  const inputFrames = Math.floor(audio.length / 2);
  if (!inputFrames || inputRate === outputRate) return audio.subarray(0, inputFrames * 2);

  if (inputRate > outputRate && inputRate % outputRate === 0) {
    const ratio = inputRate / outputRate;
    const outputFrames = Math.floor(inputFrames / ratio);
    const output = Buffer.allocUnsafe(outputFrames * 2);
    for (let frame = 0; frame < outputFrames; frame += 1) {
      let sum = 0;
      for (let offset = 0; offset < ratio; offset += 1) {
        sum += audio.readInt16LE((frame * ratio + offset) * 2);
      }
      output.writeInt16LE(Math.round(sum / ratio), frame * 2);
    }
    return output;
  }

  const outputFrames = Math.floor(inputFrames * outputRate / inputRate);
  const output = Buffer.allocUnsafe(outputFrames * 2);
  for (let frame = 0; frame < outputFrames; frame += 1) {
    const position = frame * inputRate / outputRate;
    const left = Math.floor(position);
    const right = Math.min(left + 1, inputFrames - 1);
    const fraction = position - left;
    const sample = audio.readInt16LE(left * 2) * (1 - fraction) + audio.readInt16LE(right * 2) * fraction;
    output.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample))), frame * 2);
  }
  return output;
}

function getStreamState(session, streamName) {
  const stream = session?.[`${streamName}Socket`]
    || session?.[`${streamName}Stream`]
    || session?.[streamName];
  const readyState = stream?.readyState ?? stream?.socket?.readyState;
  if (typeof readyState !== 'number') return 'unavailable';
  if (readyState === WebSocket.OPEN) return 'open';
  if (readyState === WebSocket.CONNECTING) return 'connecting';
  if (readyState === WebSocket.CLOSING) return 'closing';
  if (readyState === WebSocket.CLOSED) return 'closed';
  return `unknown(${readyState})`;
}

function sendAdapterOutput(socket, streamSid, output) {
  if (!output) return;
  if (Buffer.isBuffer(output)) {
    sendAudio(socket, streamSid, output);
    return;
  }
  if (output.type === 'media' && Buffer.isBuffer(output.audio)) {
    sendAudio(socket, streamSid, output.audio);
  } else if (output.type === 'mark' && typeof output.name === 'string') {
    sendJson(socket, { event: 'mark', stream_sid: streamSid, mark: { name: output.name } });
  } else if (output.type === 'clear') {
    sendJson(socket, { event: 'clear', stream_sid: streamSid });
  }
}

function extractEmergencyAndLocation(text) {
  if (!text || typeof text !== 'string') return { description: '', location: null };
  const cleaned = text.trim();

  // Pattern 1: "I am near/at/in/around/behind/opposite <location> and/there is <problem>"
  const match1 = cleaned.match(/^(?:i am|we are|i'm)\s+(near|at|in|around|behind|opposite)\s+(.+?)(?:[.,;]?\s+and\s+|[.]\s+|\s+and\s+)(.+)$/i);
  if (match1) {
    const locPrefix = match1[1];
    const locBody = match1[2].trim().replace(/^[,\s]+|[,\s]+$/g, '');
    const problem = match1[3] ? match1[3].trim() : '';
    const location = `${locPrefix} ${locBody}`;
    let description = problem ? problem.charAt(0).toUpperCase() + problem.slice(1) : cleaned;
    if (description && !/[.!?]$/.test(description)) description += '.';
    return { description: description || cleaned, location };
  }

  // Pattern 2: "<problem> near/at/in/around/behind/opposite <location>"
  const match2 = cleaned.match(/^(.+?)\s+(near|at|in|around|behind|opposite)\s+(.+)$/i);
  if (match2) {
    const problem = match2[1].trim();
    const locPrefix = match2[2];
    const locBody = match2[3].trim().replace(/[.!?]+$/, '');
    if (locBody.length >= 2) {
      const location = `${locPrefix} ${locBody}`;
      let description = problem.charAt(0).toUpperCase() + problem.slice(1);
      if (description && !/[.!?]$/.test(description)) description += '.';
      return { description: description || cleaned, location };
    }
  }

  return { description: cleaned, location: null };
}

function extractLocationFromFollowup(text) {
  if (!text || typeof text !== 'string') return '';
  let loc = text.trim();
  loc = loc.replace(/^(?:i am|we are|i'm|my location is|location is|it is|it's)\s+/i, '');
  return loc.replace(/[.!?]+$/, '').trim();
}

function detectPreliminaryEmergencyType(text) {
  if (!text || typeof text !== 'string') return 'other';
  const lower = text.toLowerCase();
  if (/\b(accident|crash|collision|hit|vehicle|bike|car)\b/.test(lower)) return 'accident';
  if (/\b(medical|doctor|heart|chest|stroke|pain|bleeding|unconscious|fainted|breath|ambulance|patient)\b/.test(lower)) return 'medical';
  if (/\b(fire|burn|flame|smoke)\b/.test(lower)) return 'fire';
  if (/\b(crime|theft|robbery|attack|assault|thief|gun|knife|stolen)\b/.test(lower)) return 'crime';
  if (/\b(threat|harassment|stalk|danger|trapped)\b/.test(lower)) return 'safety_threat';
  return 'other';
}

async function defaultSubmitEmergency(payload, options = {}) {
  const port = options.port || env.PORT;
  const sharedSecret = options.sharedSecret || env.SARVAM_TOOL_SHARED_SECRET;
  const url = options.url || `http://127.0.0.1:${port}/api/v1/sarvam/emergency`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sharedSecret}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMsg = body?.error || body?.message || `HTTP ${response.status}`;
    const error = new Error(`Emergency webhook failed: ${errorMsg}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function attachExotelVoiceGateway(server, options = {}) {
  const gatewayPath = options.path || env.EXOTEL_WS_PATH || '/ws';
  const createSession = options.createSession || createSarvamVoiceAgentSession;
  const submitEmergency = options.submitEmergency || defaultSubmitEmergency;
  const allowUnauthenticatedWs = options.allowUnauthenticatedWs ?? env.EXOTEL_ALLOW_UNAUTHENTICATED_WS ?? false;
  const WebSocketServer = options.WebSocketServer || WebSocket.Server;
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 100 * 1024 });

  server.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (requestUrl.pathname !== gatewayPath) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (authHeader) {
      if (!isValidBasicAuthorization(authHeader, env.EXOTEL_WS_USERNAME, env.EXOTEL_WS_PASSWORD)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
    } else if (!allowUnauthenticatedWs) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    } else {
      logger.warn('Exotel WebSocket connected without Authorization header (demo mode allowed by EXOTEL_ALLOW_UNAUTHENTICATED_WS).');
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit('connection', webSocket, request, requestUrl);
    });
  });

  webSocketServer.on('connection', (socket, request, requestUrl) => {
    let streamSid = null;
    let callSid = null;
    let session = null;
    let sessionPromise = null;
    let cleanupPromise = null;
    let startData = null;
    let messageQueue = Promise.resolve();
    let mediaFailed = false;
    let greetingSent = false;
    let conversationState = 'START';
    let storedDescription = '';
    let storedLocation = '';
    let hasSubmitted = false;
    let isProcessingTranscript = false;

    const closeSession = async () => {
      if (cleanupPromise) return cleanupPromise;
      cleanupPromise = (async () => {
        conversationState = 'END';
        if (!session && sessionPromise) {
          try {
            session = await sessionPromise;
          } catch {
            return;
          }
        }
        if (session?.close) await session.close();
        session = null;
      })();
      return cleanupPromise;
    };

    const processMessage = async (message) => {
      let eventName = 'unknown';
      try {
        const event = JSON.parse(message.toString('utf8'));
        eventName = event?.event || eventName;
        if (eventName === 'media' && mediaFailed) return;
        if (!event || typeof event.event !== 'string' || !EXOTEL_EVENTS.has(event.event)) {
          throw new Error('Unsupported Exotel WebSocket event.');
        }

        if (event.event === 'connected') return;

        if (event.event === 'start') {
          if (sessionPromise) throw new Error('Duplicate Exotel start event.');
          startData = event.start;
          streamSid = event.stream_sid || startData?.stream_sid;
          callSid = startData?.call_sid || null;
          if (typeof streamSid !== 'string' || !streamSid) throw new Error('Exotel start event is missing stream_sid.');

          sessionPromise = Promise.resolve().then(() => createSession({
            streamSid,
            callSid,
            accountSid: startData?.account_sid || null,
            from: startData?.from || null,
            to: startData?.to || null,
            sampleRate: Number(startData?.media_format?.sample_rate) || 8000,
            mediaFormat: startData?.media_format || null,
            customParameters: startData?.custom_parameters || {},
            query: Object.fromEntries(requestUrl.searchParams.entries()),
          }));
        }

        if (!sessionPromise) throw new Error('Exotel event received before start.');
        if (!session) {
          try {
            session = await sessionPromise;
          } catch {
            throw new Error('Sarvam session initialization failed.');
          }
        }

        if (event.event === 'start') {
          session.on?.('transcript.final', async (transcript) => {
            if (typeof transcript?.text !== 'string' || !transcript.text.trim()) return;
            if (hasSubmitted || isProcessingTranscript) return;

            const text = transcript.text.trim();
            isProcessingTranscript = true;

            try {
              if (conversationState === 'AWAITING_LOCATION') {
                const location = extractLocationFromFollowup(text);
                storedLocation = location || text;
                conversationState = 'SUBMITTING';
                hasSubmitted = true;

                const payload = {
                  caller_phone: startData?.from || '+919999999999',
                  interaction_id: streamSid || callSid || `exotel-${Date.now()}`,
                  emergency_type: detectPreliminaryEmergencyType(storedDescription),
                  location: storedLocation,
                  description: storedDescription,
                  severity: 'high',
                };

                try {
                  await submitEmergency(payload);
                  conversationState = 'CONFIRMATION';
                  session.sendText(CONFIRMATION_MESSAGE);
                } catch (submitError) {
                  logger.error(`Emergency submission failed: ${submitError.message}`);
                  conversationState = 'CONFIRMATION';
                  session.sendText(FAILURE_MESSAGE);
                }
                return;
              }

              if (conversationState === 'COLLECTING_EMERGENCY' || conversationState === 'START') {
                const extracted = extractEmergencyAndLocation(text);
                if (extracted.location && extracted.location.trim()) {
                  storedDescription = extracted.description || text;
                  storedLocation = extracted.location.trim();
                  conversationState = 'SUBMITTING';
                  hasSubmitted = true;

                  const payload = {
                    caller_phone: startData?.from || '+919999999999',
                    interaction_id: streamSid || callSid || `exotel-${Date.now()}`,
                    emergency_type: detectPreliminaryEmergencyType(storedDescription),
                    location: storedLocation,
                    description: storedDescription,
                    severity: 'high',
                  };

                  try {
                    await submitEmergency(payload);
                    conversationState = 'CONFIRMATION';
                    session.sendText(CONFIRMATION_MESSAGE);
                  } catch (submitError) {
                    logger.error(`Emergency submission failed: ${submitError.message}`);
                    conversationState = 'CONFIRMATION';
                    session.sendText(FAILURE_MESSAGE);
                  }
                } else {
                  storedDescription = extracted.description || text;
                  conversationState = 'AWAITING_LOCATION';
                  session.sendText(LOCATION_PROMPT);
                }
              }
            } catch (transcriptError) {
              logger.error(`Error processing transcript: ${transcriptError.message}`);
            } finally {
              isProcessingTranscript = false;
            }
          });

          session.on?.('audio', (output) => {
            try {
              if (!Buffer.isBuffer(output?.audio)) return;
              const audio = resamplePcm16le(output.audio, Number(output.sampleRate) || SARVAM_OUTPUT_SAMPLE_RATE);
              if (audio.length) sendAudio(socket, streamSid, audio);
            } catch (error) {
              logger.error(`Sarvam TTS audio handling failed: ${error.name || 'Error'}`);
            }
          });

          session.on?.('stt.error', () => logger.error('Sarvam STT reported an error.'));
          session.on?.('tts.error', () => logger.error('Sarvam TTS reported an error.'));
          session.on?.('stt.close', () => logger.warn('Sarvam STT stream closed.'));
          session.on?.('tts.close', () => logger.warn('Sarvam TTS stream closed.'));

          if (session.ready && typeof session.ready.then === 'function') {
            Promise.resolve(session.ready).then(() => {
              if (greetingSent) return;
              greetingSent = true;
              conversationState = 'COLLECTING_EMERGENCY';
              try {
                session.sendText(GREETING_PROMPT);
              } catch (error) {
                logger.error(`Sarvam opening greeting failed: ${error.name || 'Error'}`);
              }
            }).catch((error) => {
              logger.error(`Sarvam session readiness failed: ${error.name || 'Error'}`);
            });
          }
          return;
        }

        if (event.event === 'media') {
          const payload = event.media?.payload;
          if (!isBase64(payload)) throw new Error('Invalid Exotel media payload.');
          const outputs = await session.handleAudio(Buffer.from(payload, 'base64'), { streamSid, event });
          for (const output of outputs || []) sendAdapterOutput(socket, streamSid, output);
          return;
        }

        if (event.event === 'stop') {
          if (session.handleEvent) await session.handleEvent(event);
          await closeSession();
          socket.close(1000, 'Exotel stream stopped.');
          return;
        }

        if (session.handleEvent) {
          const outputs = await session.handleEvent(event);
          for (const output of outputs || []) sendAdapterOutput(socket, streamSid, output);
        }
      } catch (error) {
        if (eventName === 'media') {
          mediaFailed = true;
          logger.error(
            `Exotel voice gateway error on media: name=${error.name || 'Error'}; `
            + `message=${error.message}; stack=${error.stack}; `
            + `session=${Boolean(session)}; stt=${getStreamState(session, 'stt')}; `
            + `tts=${getStreamState(session, 'tts')}`
          );
        } else {
          logger.error(`Exotel voice gateway error on ${eventName} (${error.name || 'Error'}).`);
        }
        try {
          await closeSession();
        } catch (cleanupError) {
          logger.error(`Exotel session cleanup failed: ${cleanupError.name || 'Error'}`);
        }
        if (socket.readyState === WebSocket.OPEN) socket.close(1003, 'Invalid Exotel stream message.');
      }
    };

    socket.on('message', (message) => {
      messageQueue = messageQueue.then(() => processMessage(message), () => processMessage(message));
    });

    socket.on('close', () => {
      closeSession().catch((error) => logger.error(`Exotel session cleanup failed: ${error.name || 'Error'}`));
    });

    socket.on('error', (error) => {
      logger.error(`Exotel WebSocket error: ${error.name || 'Error'}`);
    });
  });

  return webSocketServer;
}

module.exports = {
  attachExotelVoiceGateway,
  extractEmergencyAndLocation,
  extractLocationFromFollowup,
  detectPreliminaryEmergencyType,
  defaultSubmitEmergency,
  GREETING_PROMPT,
  LOCATION_PROMPT,
  CONFIRMATION_MESSAGE,
  FAILURE_MESSAGE,
  OPENING_GREETING,
  VOICE_RESPONSE,
};
