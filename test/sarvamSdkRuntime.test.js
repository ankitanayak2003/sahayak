const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const env = require('../src/config/env');
const logger = require('../src/utils/logger');
const { createSarvamVoiceAgentSession } = require('../src/services/sarvamVoiceAgentService');
const sdkEntry = require.resolve('sarvamai');
const { ReconnectingWebSocket } = require(path.join(path.dirname(sdkEntry), 'core', 'websocket', 'ws.js'));
const SOCKET_STATES = {
  CONNECTING: ReconnectingWebSocket.CONNECTING,
  OPEN: ReconnectingWebSocket.OPEN,
  CLOSING: ReconnectingWebSocket.CLOSING,
  CLOSED: ReconnectingWebSocket.CLOSED,
};

function makeFakeClient(sttSocket, ttsSocket) {
  return class FakeSarvamAIClient {
    constructor() {
      this.speechToTextRealtimeStreaming = { async connect() { return sttSocket; } };
      this.textToSpeechStreaming = { async connect() { return ttsSocket; } };
    }
  };
}

function makeSocket(initialReadyState = SOCKET_STATES.CONNECTING) {
  const handlers = new Map();
  let openResolve;
  let openReject;
  const socket = {
    readyState: initialReadyState,
    socket: SOCKET_STATES,
    sentAudio: [],
    convertedText: [],
    ttsOperations: [],
    closed: false,
    closeCalls: 0,
    on(event, callback) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(callback);
    },
    emit(event, payload) {
      for (const callback of handlers.get(event) || []) callback(payload);
    },
    waitForOpen() {
      if (socket.readyState === SOCKET_STATES.OPEN) return Promise.resolve();
      return new Promise((resolve, reject) => {
        openResolve = resolve;
        openReject = reject;
      });
    },
    open() {
      socket.readyState = SOCKET_STATES.OPEN;
      socket.emit('open');
      openResolve?.();
      openResolve = null;
      openReject = null;
    },
    async close() {
      socket.closeCalls += 1;
      socket.closed = true;
      socket.readyState = SOCKET_STATES.CLOSED;
      socket.emit('close', { code: 1000 });
      openReject?.(new Error('Socket closed before opening.'));
      openResolve = null;
      openReject = null;
    },
    sendRealtimeAudioInput(message) { socket.sentAudio.push(message); },
    configureConnection(options) { socket.configuration = options; },
    convert(text) {
      socket.convertedText.push(text);
      socket.ttsOperations.push({ type: 'convert', text });
    },
    flush() { socket.ttsOperations.push({ type: 'flush' }); },
  };
  return socket;
}

test('uses the installed Sarvam ReconnectingWebSocket state constants', () => {
  assert.deepEqual(SOCKET_STATES, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
});

test('Sarvam streaming session wires STT and TTS events and decodes audio', async () => {
  const originalApiKey = env.SARVAM_API_KEY;
  env.SARVAM_API_KEY = 'test-streaming-key';
  const sttMessages = [];
  const ttsMessages = [];
  const sentAudio = [];
  const convertedText = [];
  const ttsOperations = [];
  const sttSocket = {
    readyState: SOCKET_STATES.OPEN,
    socket: SOCKET_STATES,
    on(event, callback) { sttMessages.push({ event, callback }); },
    async waitForOpen() {},
    sendRealtimeAudioInput(message) { sentAudio.push(message); },
    close() { this.closed = true; },
  };
  const ttsSocket = {
    readyState: SOCKET_STATES.OPEN,
    socket: SOCKET_STATES,
    on(event, callback) { ttsMessages.push({ event, callback }); },
    async waitForOpen() {},
    configureConnection(options) { this.configuration = options; },
    convert(text) {
      convertedText.push(text);
      ttsOperations.push({ type: 'convert', text });
    },
    flush() { ttsOperations.push({ type: 'flush' }); },
    close() { this.closed = true; },
  };
  let clientOptions;
  let sttOptions;
  let ttsOptions;
  class FakeSarvamAIClient {
    constructor(options) {
      clientOptions = options;
      this.speechToTextRealtimeStreaming = {
        async connect(options) { sttOptions = options; return sttSocket; },
      };
      this.textToSpeechStreaming = {
        async connect(options) { ttsOptions = options; return ttsSocket; },
      };
    }
  }

  try {
    const session = await createSarvamVoiceAgentSession(
      { callSid: 'test-call', sampleRate: 8000 },
      { SarvamAIClient: FakeSarvamAIClient }
    );
    const received = {};
    for (const event of ['transcript.partial', 'transcript.final', 'vad.speech_start', 'vad.speech_end', 'audio', 'event']) {
      session.on(event, (payload) => { received[event] = payload; });
    }

    assert.deepEqual(clientOptions, { apiSubscriptionKey: 'test-streaming-key' });
    assert.deepEqual(sttOptions, {
      language_code: 'en-IN',
      model: 'saaras:v3',
      stream_type: 'fast',
      mode: 'transcribe',
      encoding: 'pcm_s16le',
      sample_rate: 8000,
      endpointing: 'vad',
    });
    assert.deepEqual(ttsOptions, { model: 'bulbul:v3', send_completion_event: 'true' });
    assert.deepEqual(ttsSocket.configuration, {
      language_code: 'en-IN',
      speaker: 'shubh',
      speech_sample_rate: 16000,
      output_audio_codec: 'linear16',
    });

    session.sendAudio(Buffer.from([1, 2, 3]));
    assert.deepEqual(sentAudio, [{ event: 'audio_input', audio: Buffer.from([1, 2, 3]).toString('base64') }]);
    session.sendText('Hello there.');
    assert.deepEqual(convertedText, ['Hello there.']);
    assert.deepEqual(ttsOperations, [
      { type: 'convert', text: 'Hello there.' },
      { type: 'flush' },
    ]);

    const sttMessageHandler = sttMessages.find(({ event }) => event === 'message').callback;
    sttMessageHandler({ event: 'transcript.partial', text: 'Help', utterance_idx: 0 });
    sttMessageHandler({ event: 'transcript.final', text: 'Help me', utterance_idx: 0 });
    sttMessageHandler({ event: 'vad.speech_start', utterance_idx: 1 });
    sttMessageHandler({ event: 'vad.speech_end', utterance_idx: 1 });
    assert.equal(received['transcript.partial'].text, 'Help');
    assert.equal(received['transcript.final'].text, 'Help me');
    assert.equal(received['vad.speech_start'].utterance_idx, 1);
    assert.equal(received['vad.speech_end'].utterance_idx, 1);

    const ttsMessageHandler = ttsMessages.find(({ event }) => event === 'message').callback;
    const audioBytes = Buffer.from([4, 5, 6]);
    ttsMessageHandler({ type: 'audio', data: { content_type: 'audio/linear16', audio: audioBytes.toString('base64') } });
    ttsMessageHandler({ type: 'event', data: { event_type: 'final' } });
    assert.deepEqual(received.audio.audio, audioBytes);
    assert.equal(received.audio.sampleRate, 16000);
    assert.equal(received.event.event_type, 'final');

    await session.close();
    assert.equal(sttSocket.closed, true);
    assert.equal(ttsSocket.closed, true);
    assert.equal(session.provider, 'sarvam_voice_agent');
    assert.equal(session.sampleRate, 8000);
  } finally {
    env.SARVAM_API_KEY = originalApiKey;
  }
});

test('buffers early PCM in order, flushes at STT OPEN, then sends later audio immediately', async () => {
  const originalApiKey = env.SARVAM_API_KEY;
  env.SARVAM_API_KEY = 'test-streaming-key';
  const sttSocket = makeSocket();
  const ttsSocket = makeSocket();

  try {
    const session = await createSarvamVoiceAgentSession(
      { callSid: 'buffered-call', sampleRate: 8000 },
      { SarvamAIClient: makeFakeClient(sttSocket, ttsSocket) }
    );
    const firstAudio = Buffer.from([1, 2, 3, 4]);
    const secondAudio = Buffer.from([5, 6, 7, 8]);
    const thirdAudio = Buffer.from([9, 10, 11, 12]);

    session.sendText('queued while TTS connects');
    assert.equal(session.isReady, false);
    assert.deepEqual(session.readiness, {
      stt: 'connecting', tts: 'connecting', ready: false, failed: false, bufferedAudioBytes: 0,
    });
    session.sendAudio(firstAudio);
    session.sendAudio(secondAudio);
    assert.equal(sttSocket.sentAudio.length, 0);
    assert.equal(session.readiness.bufferedAudioBytes, firstAudio.length + secondAudio.length);

    sttSocket.open();
    assert.equal(sttSocket.sentAudio.length, 2);
    assert.deepEqual(sttSocket.sentAudio.map(({ audio }) => Buffer.from(audio, 'base64')),
      [firstAudio, secondAudio]);
    assert.equal(session.readiness.bufferedAudioBytes, 0);
    assert.equal(session.isReady, false);

    ttsSocket.open();
    await session.ready;
    assert.equal(session.isReady, true);
    assert.deepEqual(ttsSocket.convertedText, ['queued while TTS connects']);
    assert.deepEqual(ttsSocket.ttsOperations, [
      { type: 'convert', text: 'queued while TTS connects' },
      { type: 'flush' },
    ]);
    session.sendText('sent while TTS is open');
    assert.deepEqual(ttsSocket.convertedText, ['queued while TTS connects', 'sent while TTS is open']);
    assert.deepEqual(ttsSocket.ttsOperations, [
      { type: 'convert', text: 'queued while TTS connects' },
      { type: 'flush' },
      { type: 'convert', text: 'sent while TTS is open' },
      { type: 'flush' },
    ]);
    session.sendAudio(thirdAudio);
    assert.equal(sttSocket.sentAudio.length, 3);
    assert.deepEqual(Buffer.from(sttSocket.sentAudio[2].audio, 'base64'), thirdAudio);

    ttsSocket.close();
    assert.equal(session.readiness.tts, 'closed');
    assert.equal(session.readiness.failed, true);
    assert.throws(() => session.sendText('must not send after close'), /TTS socket closed/);
    await session.close();
    assert.equal(sttSocket.closed, true);
    assert.equal(ttsSocket.closed, true);
  } finally {
    env.SARVAM_API_KEY = originalApiKey;
  }
});

test('STT closing before OPEN discards buffered PCM, rejects readiness, and closes both sockets', async () => {
  const originalApiKey = env.SARVAM_API_KEY;
  env.SARVAM_API_KEY = 'test-streaming-key';
  const sttSocket = makeSocket();
  const ttsSocket = makeSocket();

  try {
    const session = await createSarvamVoiceAgentSession(
      { callSid: 'closed-call', sampleRate: 8000 },
      { SarvamAIClient: makeFakeClient(sttSocket, ttsSocket) }
    );
    session.sendAudio(Buffer.from([1, 2, 3, 4]));
    sttSocket.close();

    await assert.rejects(session.ready, /STT socket closed/);
    assert.equal(session.readiness.stt, 'closed');
    assert.equal(session.readiness.failed, true);
    assert.equal(session.readiness.bufferedAudioBytes, 0);
    assert.equal(sttSocket.sentAudio.length, 0);
    assert.throws(() => session.sendAudio(Buffer.from([5, 6])), /STT socket closed/);
    await session.close();
    assert.equal(sttSocket.closed, true);
    assert.equal(ttsSocket.closed, true);
  } finally {
    env.SARVAM_API_KEY = originalApiKey;
  }
});

test('bounds STT startup buffering and fails without sending audio to a connecting socket', async () => {
  const originalApiKey = env.SARVAM_API_KEY;
  env.SARVAM_API_KEY = 'test-streaming-key';
  const sttSocket = makeSocket();
  const ttsSocket = makeSocket();

  try {
    const session = await createSarvamVoiceAgentSession(
      { callSid: 'limited-call', sampleRate: 8000 },
      { SarvamAIClient: makeFakeClient(sttSocket, ttsSocket) }
    );
    session.sendAudio(Buffer.alloc(64 * 1024));
    assert.equal(session.readiness.bufferedAudioBytes, 64 * 1024);
    assert.throws(() => session.sendAudio(Buffer.alloc(2)), /buffer limit exceeded/);

    await assert.rejects(session.ready, /buffer limit exceeded/);
    assert.equal(session.readiness.failed, true);
    assert.equal(session.readiness.bufferedAudioBytes, 0);
    assert.equal(sttSocket.sentAudio.length, 0);
    await session.close();
    assert.equal(sttSocket.closed, true);
    assert.equal(ttsSocket.closed, true);
  } finally {
    env.SARVAM_API_KEY = originalApiKey;
  }
});

test('logs STT and TTS open events and connection configurations without leaking API key', async () => {
  const originalApiKey = env.SARVAM_API_KEY;
  env.SARVAM_API_KEY = 'secret-test-key-12345';
  const sttSocket = makeSocket();
  const ttsSocket = makeSocket();

  const originalInfo = logger.info;
  const loggedInfo = [];
  logger.info = (msg) => loggedInfo.push(msg);

  try {
    const session = await createSarvamVoiceAgentSession(
      { callSid: 'lifecycle-test', sampleRate: 8000 },
      { SarvamAIClient: makeFakeClient(sttSocket, ttsSocket) }
    );

    // Verify STT & TTS connection logs
    assert.ok(loggedInfo.some((msg) => msg.includes('[SARVAM_STT] Connecting STT: model=saaras:v3')));
    assert.ok(loggedInfo.some((msg) => msg.includes('[SARVAM_TTS] Connecting TTS: model=bulbul:v3')));

    // Fire OPEN events
    sttSocket.open();
    assert.ok(loggedInfo.some((msg) => msg.includes('[SARVAM_STT] WebSocket connection OPEN')));

    ttsSocket.open();
    await session.ready;
    assert.ok(loggedInfo.some((msg) => msg.includes('[SARVAM_TTS] WebSocket connection OPEN')));

    // Ensure no log contains the API key
    for (const msg of loggedInfo) {
      assert.equal(msg.includes('secret-test-key-12345'), false);
    }

    await session.close();
  } finally {
    logger.info = originalInfo;
    env.SARVAM_API_KEY = originalApiKey;
  }
});

test('logs STT close code and reason', async () => {
  const originalApiKey = env.SARVAM_API_KEY;
  env.SARVAM_API_KEY = 'test-key';
  const sttSocket = makeSocket();
  const ttsSocket = makeSocket();

  const originalWarn = logger.warn;
  const loggedWarn = [];
  logger.warn = (msg) => loggedWarn.push(msg);

  try {
    const session = await createSarvamVoiceAgentSession(
      { callSid: 'stt-close-test', sampleRate: 8000 },
      { SarvamAIClient: makeFakeClient(sttSocket, ttsSocket) }
    );

    sttSocket.open();
    ttsSocket.open();
    await session.ready;

    sttSocket.emit('close', { code: 1003, reason: 'Invalid subscription key. Visit the API Dashboard.', wasClean: true });

    assert.ok(loggedWarn.some((msg) =>
      msg.includes('[SARVAM_STT] WebSocket closed: code=1003') &&
      msg.includes('Invalid subscription key') &&
      msg.includes('wasClean=true')
    ));

    await session.close();
  } finally {
    logger.warn = originalWarn;
    env.SARVAM_API_KEY = originalApiKey;
  }
});

test('logs STT error payload from message event', async () => {
  const originalApiKey = env.SARVAM_API_KEY;
  env.SARVAM_API_KEY = 'test-key';
  const sttSocket = makeSocket();
  const ttsSocket = makeSocket();

  const originalError = logger.error;
  const loggedError = [];
  logger.error = (msg) => loggedError.push(msg);

  try {
    const session = await createSarvamVoiceAgentSession(
      { callSid: 'stt-error-test', sampleRate: 8000 },
      { SarvamAIClient: makeFakeClient(sttSocket, ttsSocket) }
    );

    sttSocket.open();
    ttsSocket.open();
    await session.ready;

    sttSocket.emit('message', {
      event: 'error',
      code: 'invalid_subscription_key',
      message: 'Invalid subscription key. Visit the API Dashboard to review and manage your subscription.',
      is_fatal: true,
      status_code: 401,
    });

    assert.ok(loggedError.some((msg) =>
      msg.includes('[SARVAM_STT] Received error event payload:') &&
      msg.includes('invalid_subscription_key')
    ));

    await session.close();
  } finally {
    logger.error = originalError;
    env.SARVAM_API_KEY = originalApiKey;
  }
});

test('logs TTS close code and reason', async () => {
  const originalApiKey = env.SARVAM_API_KEY;
  env.SARVAM_API_KEY = 'test-key';
  const sttSocket = makeSocket();
  const ttsSocket = makeSocket();

  const originalWarn = logger.warn;
  const loggedWarn = [];
  logger.warn = (msg) => loggedWarn.push(msg);

  try {
    const session = await createSarvamVoiceAgentSession(
      { callSid: 'tts-close-test', sampleRate: 8000 },
      { SarvamAIClient: makeFakeClient(sttSocket, ttsSocket) }
    );

    sttSocket.open();
    ttsSocket.open();
    await session.ready;

    ttsSocket.emit('close', { code: 1006, reason: 'Abnormal closure', wasClean: false });

    assert.ok(loggedWarn.some((msg) =>
      msg.includes('[SARVAM_TTS] WebSocket closed: code=1006') &&
      msg.includes('Abnormal closure') &&
      msg.includes('wasClean=false')
    ));

    await session.close();
  } finally {
    logger.warn = originalWarn;
    env.SARVAM_API_KEY = originalApiKey;
  }
});

test('logs TTS error payload from message event', async () => {
  const originalApiKey = env.SARVAM_API_KEY;
  env.SARVAM_API_KEY = 'test-key';
  const sttSocket = makeSocket();
  const ttsSocket = makeSocket();

  const originalError = logger.error;
  const loggedError = [];
  logger.error = (msg) => loggedError.push(msg);

  try {
    const session = await createSarvamVoiceAgentSession(
      { callSid: 'tts-error-test', sampleRate: 8000 },
      { SarvamAIClient: makeFakeClient(sttSocket, ttsSocket) }
    );

    sttSocket.open();
    ttsSocket.open();
    await session.ready;

    ttsSocket.emit('message', {
      type: 'error',
      data: { code: 'quota_exceeded', message: 'Rate limit reached' },
    });

    assert.ok(loggedError.some((msg) =>
      msg.includes('[SARVAM_TTS] Received error event payload:') &&
      msg.includes('quota_exceeded')
    ));

    await session.close();
  } finally {
    logger.error = originalError;
    env.SARVAM_API_KEY = originalApiKey;
  }
});