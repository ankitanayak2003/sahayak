/**
 * @deprecated
 * Legacy realtime STT/TTS streaming session helper.
 * In the hosted Sarvam Voice Agent architecture, speech recognition, voice conversation,
 * and text-to-speech are fully handled by the hosted Sarvam Voice Agent app on apps.sarvam.ai.
 * This module is retained for backwards compatibility and unit testing.
 */

const { SarvamAIClient } = require('sarvamai');
const env = require('../config/env');
const logger = require('../utils/logger');

const SARVAM_OUTPUT_SAMPLE_RATE = 16000;
const MAX_BUFFERED_STT_AUDIO_BYTES = 64 * 1024;
const MAX_BUFFERED_TTS_TEXTS = 16;
const SENSITIVE_DIAGNOSTIC_KEY = /authorization|headers?|api.?subscription.?key|api.?key|secret|token|password|cookie|signed.?url|request|config|url/i;

function safeDiagnosticString(value) {
  let text = String(value);
  if (env.SARVAM_API_KEY) text = text.split(env.SARVAM_API_KEY).join('[REDACTED]');
  return text
    .replace(/\b(Bearer|Basic)\s+[^\s"',;]+/gi, '$1 [REDACTED]')
    .replace(/\b(api[-_]?subscription[-_]?key|api[-_]?key|authorization|access[_-]?token|token|password|secret)\s*[:=]\s*["']?[^\s"',;]+/gi, '$1=[REDACTED]')
    .replace(/([?&](?:access[_-])?token|[?&](?:api[_-]?(?:subscription[_-]?)?)?key|[?&](?:signature|sig))=([^&#\s]+)/gi, '$1=[REDACTED]');
}

function readDiagnosticProperty(value, key) {
  try {
    return value?.[key];
  } catch {
    return undefined;
  }
}

function serializeDiagnosticValue(value, seen = new WeakSet(), depth = 0) {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return safeDiagnosticString(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol' || typeof value === 'function') return safeDiagnosticString(value);
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (depth >= 5) return '[Max depth]';
  if (value instanceof Error) return serializeDiagnosticError(value, seen, depth + 1);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => serializeDiagnosticValue(item, seen, depth + 1));
  }

  const serialized = {};
  for (const key of Object.keys(value).slice(0, 50)) {
    if (SENSITIVE_DIAGNOSTIC_KEY.test(key)) continue;
    serialized[key] = serializeDiagnosticValue(readDiagnosticProperty(value, key), seen, depth + 1);
  }
  for (const key of ['status', 'statusText', 'code', 'message', 'data']) {
    if (Object.hasOwn(serialized, key)) continue;
    const field = readDiagnosticProperty(value, key);
    if (field !== undefined) serialized[key] = serializeDiagnosticValue(field, seen, depth + 1);
  }
  return serialized;
}

function serializeDiagnosticError(error, seen = new WeakSet(), depth = 0) {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) {
    return { name: 'Error', message: safeDiagnosticString(error) };
  }
  if (seen.has(error)) return { name: 'Error', message: '[Circular]' };
  seen.add(error);

  const result = {};
  for (const key of ['name', 'message', 'stack', 'code', 'status', 'statusCode', 'statusText', 'response', 'cause']) {
    const value = readDiagnosticProperty(error, key);
    if (value !== undefined) {
      result[key] = key === 'name' || key === 'message' || key === 'stack'
        ? safeDiagnosticString(value)
        : serializeDiagnosticValue(value, seen, depth + 1);
    }
  }
  if (!result.name) result.name = 'Error';
  if (!result.message) result.message = safeDiagnosticString(error);

  const properties = {};
  for (const key of Object.keys(error).slice(0, 50)) {
    if (SENSITIVE_DIAGNOSTIC_KEY.test(key)) continue;
    properties[key] = serializeDiagnosticValue(readDiagnosticProperty(error, key), seen, depth + 1);
  }
  result.properties = properties;
  return result;
}

function logSarvamError(context, error) {
  logger.error(`Sarvam ${context}: ${JSON.stringify(serializeDiagnosticError(error))}`);
}

function socketReadyState(socket) {
  const constants = socket?.socket;
  if (!constants) return 'unknown';
  if (socket.readyState === constants.CONNECTING) return 'connecting';
  if (socket.readyState === constants.OPEN) return 'open';
  if (socket.readyState === constants.CLOSING) return 'closing';
  if (socket.readyState === constants.CLOSED) return 'closed';
  return 'unknown';
}

function socketIsOpen(socket) {
  return socketReadyState(socket) === 'open';
}

function requiredConfigValue(name, value) {
  if (!value) throw new Error(`${name} is required for the Sarvam streaming session.`);
  return value;
}

function buildInteractionConfig(sessionMetadata) {
  const sampleRate = Number(sessionMetadata.sampleRate) || 8000;
  if (![8000, 16000].includes(sampleRate)) {
    throw new Error('Sarvam Voice Agent input sample rate must be 8000 or 16000 Hz.');
  }

  const from = typeof sessionMetadata.from === 'string' && sessionMetadata.from.trim();
  return {
    user_identifier_type: from ? 'phone_number' : 'custom',
    user_identifier: from || sessionMetadata.callSid || sessionMetadata.streamSid,
    org_id: requiredConfigValue('SARVAM_ORG_ID', env.SARVAM_ORG_ID),
    workspace_id: requiredConfigValue('SARVAM_WORKSPACE_ID', env.SARVAM_WORKSPACE_ID),
    app_id: requiredConfigValue('SARVAM_APP_ID', env.SARVAM_APP_ID),
    interaction_type: 'call',
    input_sample_rate: sampleRate,
    output_sample_rate: SARVAM_OUTPUT_SAMPLE_RATE,
  };
}

async function createSarvamVoiceAgentSession(sessionMetadata, options = {}) {
  const apiKey = requiredConfigValue('SARVAM_API_KEY', env.SARVAM_API_KEY);
  const inputSampleRate = Number(sessionMetadata.sampleRate) || 8000;
  if (![8000, 16000].includes(inputSampleRate)) {
    throw new Error('Sarvam Voice Agent input sample rate must be 8000 or 16000 Hz.');
  }
  const ClientClass = options.SarvamAIClient || SarvamAIClient;
  const client = new ClientClass({ apiSubscriptionKey: apiKey });
  let sttSocket;
  let ttsSocket;
  let session;
  let closePromise;
  try {
    const sttConfig = {
      language_code: 'en-IN',
      model: 'saaras:v3',
      stream_type: 'fast',
      mode: 'transcribe',
      encoding: 'pcm_s16le',
      sample_rate: inputSampleRate,
      endpointing: 'vad',
    };
    logger.info(`[SARVAM_STT] Connecting STT: model=${sttConfig.model}, language_code=${sttConfig.language_code}, encoding=${sttConfig.encoding}, sample_rate=${sttConfig.sample_rate}, endpointing=${sttConfig.endpointing}`);
    try {
      sttSocket = await client.speechToTextRealtimeStreaming.connect(sttConfig);
    } catch (error) {
      logSarvamError('STT connect failed', error);
      throw error;
    }
    const ttsConnectConfig = {
      model: 'bulbul:v3',
      send_completion_event: 'true',
    };
    logger.info(`[SARVAM_TTS] Connecting TTS: model=${ttsConnectConfig.model}, send_completion_event=${ttsConnectConfig.send_completion_event}`);
    try {
      ttsSocket = await client.textToSpeechStreaming.connect(ttsConnectConfig);
    } catch (error) {
      logSarvamError('TTS connect failed', error);
      throw error;
    }

    const listeners = new Map();
    const emit = (event, payload) => {
      for (const callback of listeners.get(event) || []) callback(payload);
    };
    let sttState = socketReadyState(sttSocket);
    let ttsState = socketReadyState(ttsSocket);
    let ttsConfigured = false;
    let failed = false;
    let failureError = null;
    let bufferedAudio = [];
    let bufferedAudioBytes = 0;
    let bufferedTexts = [];
    let readySettled = false;
    let resolveReady;
    let rejectReady;
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    ready.catch((error) => logSarvamError('session readiness rejected', error));

    const isReady = () => !failed && sttState === 'open' && ttsState === 'open' && ttsConfigured;

    const updateReady = () => {
      if (!readySettled && isReady()) {
        readySettled = true;
        resolveReady(session);
      }
    };

    const failSession = (error) => {
      if (failed) return;
      failed = true;
      failureError = error ?? new Error('Sarvam streaming session failed.');
      bufferedAudio = [];
      bufferedAudioBytes = 0;
      bufferedTexts = [];
      if (!readySettled) {
        readySettled = true;
        rejectReady(failureError);
      }
    };

    const closeOnFailure = (error) => {
      failSession(error);
      session?.close().catch(() => {});
    };

    const sendSttAudio = (audio) => {
      const currentState = socketReadyState(sttSocket);
      if (sttState !== 'open' || currentState !== 'open') {
        throw new Error(`Sarvam STT socket is ${currentState}, not open.`);
      }
      sttSocket.sendRealtimeAudioInput({
        event: 'audio_input',
        audio: audio.toString('base64'),
      });
    };

    const flushBufferedAudio = () => {
      while (bufferedAudio.length && !failed) {
        const audio = bufferedAudio[0];
        sendSttAudio(audio);
        bufferedAudio.shift();
        bufferedAudioBytes -= audio.length;
      }
    };

    const onSttOpen = () => {
      if (failed || !socketIsOpen(sttSocket)) return;
      sttState = 'open';
      logger.info('[SARVAM_STT] WebSocket connection OPEN');
      try {
        flushBufferedAudio();
        updateReady();
      } catch (error) {
        closeOnFailure(error);
        emit('stt.error', error);
      }
    };

    const sendTtsText = (text) => {
      const currentState = socketReadyState(ttsSocket);
      if (ttsState !== 'open' || currentState !== 'open' || !ttsConfigured) {
        throw new Error(`Sarvam TTS socket is ${currentState}, not open.`);
      }
      ttsSocket.convert(text);
      ttsSocket.flush();
    };

    const onTtsOpen = () => {
      if (failed || !socketIsOpen(ttsSocket)) return;
      ttsState = 'open';
      logger.info('[SARVAM_TTS] WebSocket connection OPEN');
      try {
        if (!ttsConfigured) {
          logger.info(`[SARVAM_TTS] Configuring TTS connection: language_code=en-IN, speaker=shubh, speech_sample_rate=${SARVAM_OUTPUT_SAMPLE_RATE}, output_audio_codec=linear16`);
          ttsSocket.configureConnection({
            language_code: 'en-IN',
            speaker: 'shubh',
            speech_sample_rate: SARVAM_OUTPUT_SAMPLE_RATE,
            output_audio_codec: 'linear16',
          });
          ttsConfigured = true;
        }
        while (bufferedTexts.length && !failed) sendTtsText(bufferedTexts.shift());
        updateReady();
      } catch (error) {
        closeOnFailure(error);
        emit('tts.error', error);
      }
    };

    const watchSocketOpen = (socket, provider, onOpen) => {
      socket.on('open', onOpen);
      const onReadinessRejected = (error) => {
        logSarvamError(`${provider.toUpperCase()} readiness rejected`, error);
        closeOnFailure(error);
      };
      try {
        Promise.resolve(socket.waitForOpen()).then(() => {
          if (socketIsOpen(socket)) onOpen();
        }, onReadinessRejected);
      } catch (error) {
        onReadinessRejected(error);
      }
      if (socketIsOpen(socket)) onOpen();
    };

    const handleSocketClose = (provider, event) => {
      if (provider === 'stt') sttState = 'closed';
      else ttsState = 'closed';
      const code = event?.code ?? 'unknown';
      const reason = safeDiagnosticString(event?.reason || 'none');
      logger.warn(`[SARVAM_${provider.toUpperCase()}] WebSocket closed: code=${code}, reason=${reason}, wasClean=${Boolean(event?.wasClean)}`);
      const error = new Error(`Sarvam ${provider.toUpperCase()} socket closed.`);
      failSession(error);
      emit(`${provider}.close`, event);
      session?.close().catch(() => {});
    };

    const handleSocketError = (provider, error) => {
      const errorMsg = safeDiagnosticString(error?.message || error);
      logger.error(`[SARVAM_${provider.toUpperCase()}] WebSocket error: message=${errorMsg}, code=${error?.code || 'none'}`);
      logSarvamError(`${provider.toUpperCase()} socket error`, error);
      emit(`${provider}.error`, error);
      closeOnFailure(error);
    };

    session = {
      provider: 'sarvam_voice_agent',
      sessionMetadata,
      sampleRate: inputSampleRate,
      ready,
      get isReady() { return isReady(); },
      get readiness() {
        return { stt: sttState, tts: ttsState, ready: isReady(), failed, bufferedAudioBytes };
      },
      on(event, callback) {
        if (typeof callback !== 'function') throw new TypeError('Event callback must be a function.');
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(callback);
        return session;
      },
      off(event, callback) {
        listeners.get(event)?.delete(callback);
        return session;
      },
      sendAudio(audio) {
        if (failed) throw failureError;
        const pcm = Buffer.from(audio);
        if (socketIsOpen(sttSocket) && sttState !== 'open') onSttOpen();
        if (failed) throw failureError;
        if (sttState === 'open') {
          sendSttAudio(pcm);
          return;
        }
        if (sttState !== 'connecting') throw new Error(`Sarvam STT socket is ${sttState}.`);
        if (bufferedAudioBytes + pcm.length > MAX_BUFFERED_STT_AUDIO_BYTES) {
          const error = new Error('Sarvam STT startup audio buffer limit exceeded.');
          closeOnFailure(error);
          throw error;
        }
        bufferedAudio.push(pcm);
        bufferedAudioBytes += pcm.length;
      },
      sendText(text) {
        if (failed) throw failureError;
        if (socketIsOpen(ttsSocket) && ttsState !== 'open') onTtsOpen();
        if (failed) throw failureError;
        if (ttsState === 'open') {
          sendTtsText(text);
          return;
        }
        if (ttsState !== 'connecting') throw new Error(`Sarvam TTS socket is ${ttsState}.`);
        if (bufferedTexts.length >= MAX_BUFFERED_TTS_TEXTS) {
          throw new Error('Sarvam TTS startup text buffer limit exceeded.');
        }
        bufferedTexts.push(text);
      },
      async handleAudio(audio) {
        session.sendAudio(audio);
        return [];
      },
      async handleEvent() {
        return [];
      },
      async close() {
        if (closePromise) return closePromise;
        if (!isReady()) failSession(new Error('Sarvam session closed before becoming ready.'));
        bufferedAudio = [];
        bufferedAudioBytes = 0;
        bufferedTexts = [];
        closePromise = Promise.allSettled([
          Promise.resolve().then(() => sttSocket.close()),
          Promise.resolve().then(() => ttsSocket.close()),
        ]);
        await closePromise;
      },
    };

    sttSocket.on('message', (message) => {
      if (message?.event === 'error' || message?.type === 'error') {
        const payloadStr = safeDiagnosticString(JSON.stringify(message));
        logger.error(`[SARVAM_STT] Received error event payload: ${payloadStr}`);
        emit('stt.error', message);
      }
      if (typeof message?.event === 'string') emit(message.event, message);
      emit('stt.message', message);
    });
    ttsSocket.on('message', (message) => {
      if (message?.type === 'error' || message?.event === 'error') {
        const payloadStr = safeDiagnosticString(JSON.stringify(message?.data || message));
        logger.error(`[SARVAM_TTS] Received error event payload: ${payloadStr}`);
      }
      if (message?.type === 'audio' && typeof message.data?.audio === 'string') {
        emit('audio', {
          ...message.data,
          audio: Buffer.from(message.data.audio, 'base64'),
          sampleRate: SARVAM_OUTPUT_SAMPLE_RATE,
        });
      } else if (message?.type === 'event' && message.data?.event_type === 'final') {
        emit('event', message.data);
      } else if (message?.type === 'error') {
        emit('tts.error', message.data);
      }
      emit('tts.message', message);
    });
    sttSocket.on('error', (error) => handleSocketError('stt', error));
    ttsSocket.on('error', (error) => handleSocketError('tts', error));
    sttSocket.on('close', (event) => handleSocketClose('stt', event));
    ttsSocket.on('close', (event) => handleSocketClose('tts', event));
    watchSocketOpen(sttSocket, 'stt', onSttOpen);
    watchSocketOpen(ttsSocket, 'tts', onTtsOpen);

    return session;
  } catch (error) {
    await Promise.allSettled([
      Promise.resolve().then(() => sttSocket?.close()),
      Promise.resolve().then(() => ttsSocket?.close()),
    ]);
    throw error;
  }
}

module.exports = { buildInteractionConfig, createSarvamVoiceAgentSession };
