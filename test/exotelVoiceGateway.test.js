const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const {
  attachExotelVoiceGateway,
  extractEmergencyAndLocation,
  extractLocationFromFollowup,
  detectPreliminaryEmergencyType,
  GREETING_PROMPT,
  LOCATION_PROMPT,
  CONFIRMATION_MESSAGE,
  FAILURE_MESSAGE,
} = require('../src/services/exotelVoiceGateway');
const logger = require('../src/utils/logger');

class FakeWebSocketServer extends EventEmitter {
  static OPEN = 1;

  constructor() {
    super();
    FakeWebSocketServer.instance = this;
  }
}

class FakeSocket extends EventEmitter {
  readyState = FakeWebSocketServer.OPEN;
  sent = [];
  closeInfo = null;

  send(message) {
    this.sent.push(JSON.parse(message));
  }

  close(code, reason) {
    this.closeInfo = { code, reason };
    this.readyState = 3;
    this.emit('close');
  }

  receive(message) {
    this.emit('message', Buffer.from(JSON.stringify(message)));
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((complete) => { resolve = complete; });
  return { promise, resolve };
}

function createGateway(createSession, options = {}) {
  const server = new EventEmitter();
  attachExotelVoiceGateway(server, { createSession, WebSocketServer: FakeWebSocketServer, ...options });
  const socket = new FakeSocket();
  FakeWebSocketServer.instance.emit('connection', socket, { headers: {} }, new URL('ws://localhost/ws'));
  return socket;
}

function startEvent(overrides = {}) {
  return {
    event: 'start',
    stream_sid: 'stream-1',
    start: { call_sid: 'call-1', from: '+919876543210', media_format: { sample_rate: 8000 }, ...overrides },
  };
}

function fakeSession(overrides = {}) {
  const listeners = new Map();
  const receivedAudio = [];
  const sentText = [];
  const ttsOperations = [];
  const session = {
    ready: Promise.resolve(),
    on(event, callback) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(callback);
      return session;
    },
    async handleAudio(audio) {
      receivedAudio.push(audio);
      return [];
    },
    async handleEvent() { return []; },
    sendText(text) {
      sentText.push(text);
      ttsOperations.push({ type: 'convert', text });
      ttsOperations.push({ type: 'flush' });
    },
    async close() { session.closed = true; },
    emit(event, payload) {
      for (const callback of listeners.get(event) || []) callback(payload);
    },
    receivedAudio,
    sentText,
    ttsOperations,
    ...overrides,
  };
  return session;
}

test('queues first Exotel media while one Sarvam session is initializing', async () => {
  const initialization = deferred();
  const createCalled = deferred();
  const audioHandled = deferred();
  let createCount = 0;
  const session = fakeSession({
    async handleAudio(audio) {
      session.receivedAudio.push(audio);
      audioHandled.resolve();
      return [];
    },
  });
  const socket = createGateway(() => {
    createCount += 1;
    createCalled.resolve();
    return initialization.promise;
  });
  const pcm = Buffer.from([1, 2, 3, 4]);

  socket.receive({ event: 'connected' });
  socket.receive(startEvent());
  socket.receive({ event: 'media', stream_sid: 'stream-1', media: { payload: pcm.toString('base64') } });
  await createCalled.promise;

  assert.equal(socket.closeInfo, null);
  assert.equal(createCount, 1);
  initialization.resolve(session);
  await audioHandled.promise;

  assert.deepEqual(session.receivedAudio, [pcm]);
  assert.equal(createCount, 1);
});

test('duplicate Exotel start does not create a second Sarvam session', async () => {
  const initialization = deferred();
  const createCalled = deferred();
  const socketClosed = deferred();
  let createCount = 0;
  const session = fakeSession();
  const socket = createGateway(() => {
    createCount += 1;
    createCalled.resolve();
    return initialization.promise;
  });
  socket.on('close', () => socketClosed.resolve());

  socket.receive(startEvent());
  socket.receive(startEvent());
  await createCalled.promise;
  initialization.resolve(session);
  await socketClosed.promise;

  assert.equal(createCount, 1);
  assert.equal(session.closed, true);
});

test('single-turn transcript with emergency and location submits to webhook and speaks confirmation', async () => {
  const session = fakeSession();
  const submitted = [];
  const socket = createGateway(async () => session, {
    submitEmergency: async (payload) => {
      submitted.push(payload);
      return { success: true, data: { request_id: 'req-1', status: 'escalated_to_112' } };
    },
  });
  socket.receive(startEvent());
  await new Promise((resolve) => setImmediate(resolve));

  session.emit('transcript.partial', { text: 'partial' });
  assert.deepEqual(session.sentText, [GREETING_PROMPT]);

  session.emit('transcript.final', { text: 'I am near KLE Tech, Hubballi and there is an accident.' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].caller_phone, '+919876543210');
  assert.equal(submitted[0].interaction_id, 'stream-1');
  assert.equal(submitted[0].emergency_type, 'accident');
  assert.equal(submitted[0].location, 'near KLE Tech, Hubballi');
  assert.equal(submitted[0].description, 'There is an accident.');
  assert.equal(submitted[0].severity, 'high');

  assert.deepEqual(session.sentText, [
    GREETING_PROMPT,
    CONFIRMATION_MESSAGE,
  ]);
  assert.deepEqual(session.ttsOperations, [
    { type: 'convert', text: GREETING_PROMPT },
    { type: 'flush' },
    { type: 'convert', text: CONFIRMATION_MESSAGE },
    { type: 'flush' },
  ]);

  session.emit('audio', {
    audio: Buffer.from([0xe8, 0x03, 0xb8, 0x0b, 0x18, 0xfc, 0x48, 0xf4]),
    sampleRate: 16000,
  });
  assert.deepEqual(socket.sent, [{
    event: 'media',
    stream_sid: 'stream-1',
    media: { payload: Buffer.from([0xd0, 0x07, 0x30, 0xf8]).toString('base64') },
  }]);
});

test('missing location asks follow-up and submits combined data on next transcript', async () => {
  const session = fakeSession();
  const submitted = [];
  const socket = createGateway(async () => session, {
    submitEmergency: async (payload) => {
      submitted.push(payload);
      return { success: true, data: { request_id: 'req-2', status: 'escalated_to_112' } };
    },
  });
  socket.receive(startEvent());
  await new Promise((resolve) => setImmediate(resolve));

  // Turn 1: Only problem, location is missing
  session.emit('transcript.final', { text: 'There is an accident.' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(submitted.length, 0);
  assert.deepEqual(session.sentText, [
    GREETING_PROMPT,
    LOCATION_PROMPT,
  ]);

  // Turn 2: Caller gives location
  session.emit('transcript.final', { text: 'KLE Tech, Hubballi' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].caller_phone, '+919876543210');
  assert.equal(submitted[0].interaction_id, 'stream-1');
  assert.equal(submitted[0].location, 'KLE Tech, Hubballi');
  assert.equal(submitted[0].description, 'There is an accident.');
  assert.deepEqual(session.sentText, [
    GREETING_PROMPT,
    LOCATION_PROMPT,
    CONFIRMATION_MESSAGE,
  ]);
});

test('duplicate transcript.final does not trigger second webhook submission', async () => {
  const session = fakeSession();
  const submitted = [];
  const socket = createGateway(async () => session, {
    submitEmergency: async (payload) => {
      submitted.push(payload);
      return { success: true };
    },
  });
  socket.receive(startEvent());
  await new Promise((resolve) => setImmediate(resolve));

  session.emit('transcript.final', { text: 'I am near KLE Tech, Hubballi and there is an accident.' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(submitted.length, 1);

  // Send duplicate or extra transcript
  session.emit('transcript.final', { text: 'I am near KLE Tech, Hubballi and there is an accident.' });
  session.emit('transcript.final', { text: 'Please hurry.' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(submitted.length, 1);
});

test('webhook failure speaks sorry message and does not falsely confirm', async () => {
  const session = fakeSession();
  const socket = createGateway(async () => session, {
    submitEmergency: async () => {
      throw new Error('Connection to emergency service failed.');
    },
  });
  socket.receive(startEvent());
  await new Promise((resolve) => setImmediate(resolve));

  session.emit('transcript.final', { text: 'I am near KLE Tech, Hubballi and there is an accident.' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(session.sentText, [
    GREETING_PROMPT,
    FAILURE_MESSAGE,
  ]);
});

test('sends exactly one opening greeting only after the Sarvam session is ready', async () => {
  const readiness = deferred();
  const session = fakeSession({ ready: readiness.promise });
  const socket = createGateway(async () => session);
  socket.receive(startEvent());
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(session.sentText, []);
  readiness.resolve(session);
  await new Promise((resolve) => setImmediate(resolve));
  session.emit('stt.open');
  session.emit('tts.open');
  readiness.resolve(session);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(session.sentText, [GREETING_PROMPT]);
  assert.deepEqual(session.ttsOperations, [
    { type: 'convert', text: GREETING_PROMPT },
    { type: 'flush' },
  ]);
});

test('Exotel disconnect closes its Sarvam session', async () => {
  const session = fakeSession();
  const socket = createGateway(async () => session);
  socket.receive(startEvent());
  await new Promise((resolve) => setImmediate(resolve));

  socket.emit('close');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.closed, true);
});

test('Sarvam errors and TTS request failures do not crash the gateway', async () => {
  const session = fakeSession({ sendText() { throw new Error('provider request failed'); } });
  const socket = createGateway(async () => session);
  socket.receive(startEvent());
  await new Promise((resolve) => setImmediate(resolve));

  assert.doesNotThrow(() => session.emit('stt.error', new Error('provider stream failed')));
  assert.doesNotThrow(() => session.emit('transcript.final', { text: 'Help.' }));
  assert.equal(socket.closeInfo, null);
});

test('logs the first media failure with diagnostics, skips later media, and cleans up', async () => {
  const failure = new Error('actual media processing failure');
  failure.name = 'SarvamMediaError';
  let mediaCalls = 0;
  let closeCalls = 0;
  const session = fakeSession({
    sttSocket: { readyState: 1 },
    ttsSocket: { readyState: 3 },
    async handleAudio() {
      mediaCalls += 1;
      throw failure;
    },
    async close() {
      closeCalls += 1;
    },
  });
  const socket = createGateway(async () => session);
  const originalError = logger.error;
  const logged = [];
  logger.error = (message) => logged.push(message);

  try {
    socket.receive(startEvent());
    await new Promise((resolve) => setImmediate(resolve));
    const media = { event: 'media', media: { payload: Buffer.from([1, 2]).toString('base64') } };
    socket.receive(media);
    await new Promise((resolve) => setImmediate(resolve));
    socket.receive(media);
    socket.receive(media);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(mediaCalls, 1);
    assert.equal(closeCalls, 1);
    assert.equal(logged.length, 1);
    assert.match(logged[0], /error on media/);
    assert.match(logged[0], /name=SarvamMediaError/);
    assert.match(logged[0], /message=actual media processing failure/);
    assert.match(logged[0], /stack=SarvamMediaError: actual media processing failure/);
    assert.match(logged[0], /session=true/);
    assert.match(logged[0], /stt=open/);
    assert.match(logged[0], /tts=closed/);
  } finally {
    logger.error = originalError;
  }
});

test('extractEmergencyAndLocation parses location and description correctly', () => {
  const res1 = extractEmergencyAndLocation('I am near KLE Tech, Hubballi and there is an accident.');
  assert.equal(res1.location, 'near KLE Tech, Hubballi');
  assert.equal(res1.description, 'There is an accident.');

  const res2 = extractEmergencyAndLocation('There is an accident near KLE Tech, Hubballi.');
  assert.equal(res2.location, 'near KLE Tech, Hubballi');
  assert.equal(res2.description, 'There is an accident.');

  const res3 = extractEmergencyAndLocation('There is an accident.');
  assert.equal(res3.location, null);
  assert.equal(res3.description, 'There is an accident.');
});

test('extractLocationFromFollowup cleans caller location response', () => {
  assert.equal(extractLocationFromFollowup('I am near KLE Tech, Hubballi.'), 'near KLE Tech, Hubballi');
  assert.equal(extractLocationFromFollowup('KLE Tech, Hubballi'), 'KLE Tech, Hubballi');
  assert.equal(extractLocationFromFollowup('my location is BTM 2nd stage.'), 'BTM 2nd stage');
});

test('detectPreliminaryEmergencyType identifies primary incident categories', () => {
  assert.equal(detectPreliminaryEmergencyType('There was a severe car crash'), 'accident');
  assert.equal(detectPreliminaryEmergencyType('Chest pain and difficulty breathing'), 'medical');
  assert.equal(detectPreliminaryEmergencyType('Building caught fire with heavy smoke'), 'fire');
  assert.equal(detectPreliminaryEmergencyType('Robbery in progress at the shop'), 'crime');
  assert.equal(detectPreliminaryEmergencyType('I need some other help'), 'other');
});