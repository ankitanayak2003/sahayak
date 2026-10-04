const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { ObjectId } = require('mongodb');
const WebSocket = require('ws');
const env = require('../src/config/env');
const { createSarvamEmergencyHandler, requireSarvamToolAuthentication } = require('../src/routes/sarvam');
const { attachExotelVoiceGateway } = require('../src/services/exotelVoiceGateway');

env.SARVAM_TOOL_SHARED_SECRET = 'test-sarvam-tool-secret';
env.EXOTEL_WS_USERNAME = 'test-exotel-user';
env.EXOTEL_WS_PASSWORD = 'test-exotel-password';
env.EXOTEL_ALLOW_UNAUTHENTICATED_WS = false;

function responseRecorder(resolve) {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      resolve(this);
      return this;
    },
  };
}

function middlewareResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function fakeDatabase() {
  const requests = [];
  const collections = {
    assistance_requests: {
      async createIndex() {},
      async findOne(query) {
        return requests.find(request => request.interaction_id === query.interaction_id) || null;
      },
      async insertOne(document) {
        const request = { ...document, _id: new ObjectId() };
        requests.push(request);
        return { insertedId: request._id };
      },
      async updateOne() {
        return { matchedCount: 1 };
      },
    },
    request_status_history: { async insertOne() {} },
    emergency_escalations: { async insertOne() {} },
  };
  return { requests, collection(name) { return collections[name]; } };
}

function invokeSarvam(body, authorization) {
  const db = fakeDatabase();
  const handler = createSarvamEmergencyHandler({
    getDatabase: () => db,
    classify: async () => ({
      is_emergency: true,
      emergency_type: 'medical',
      severity: 'medium',
      disposition: 'emergency',
      reason: 'Test emergency classification.',
    }),
  });
  const req = { body, get(name) { return name === 'Authorization' ? authorization : undefined; } };
  return new Promise((resolve, reject) => {
    const res = responseRecorder(resolve);
    requireSarvamToolAuthentication(req, res, () => handler(req, res, reject));
  });
}

const requestBody = {
  caller_phone: '9876543210',
  interaction_id: 'provider-auth-test',
  emergency_type: 'medical',
  location: 'Test location',
  description: 'Test description',
  severity: 'low',
};

test('Sarvam request with valid Bearer secret preserves existing behavior', async () => {
  const response = await invokeSarvam(requestBody, 'Bearer test-sarvam-tool-secret');
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.status, 'pending_assignment');
});

test('Sarvam request without authorization is rejected', async () => {
  const response = await invokeSarvam(requestBody, undefined);
  assert.equal(response.statusCode, 401);
});

test('Sarvam request with the wrong secret is rejected', async () => {
  const response = await invokeSarvam(requestBody, 'Bearer wrong-secret');
  assert.equal(response.statusCode, 401);
});

async function withGateway(run) {
  const server = http.createServer();
  attachExotelVoiceGateway(server, {
    createSession: async () => ({
      async handleAudio() { return []; },
      async handleEvent() { return []; },
      async close() {},
    }),
  });
  await new Promise(resolve => server.listen(0, resolve));
  try {
    return await run(server.address().port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

function basicHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function openWebSocket(port, authorization) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, authorization ? { headers: { Authorization: authorization } } : undefined);
    socket.once('open', () => resolve({ socket, statusCode: 101 }));
    socket.once('unexpected-response', (request, response) => resolve({ socket, statusCode: response.statusCode }));
    socket.once('error', reject);
  });
}

test('WebSocket handshake with valid Basic Auth is accepted', async () => {
  await withGateway(async port => {
    const result = await openWebSocket(port, basicHeader('test-exotel-user', 'test-exotel-password'));
    assert.equal(result.statusCode, 101);
    result.socket.close();
  });
});

test('WebSocket handshake without Basic Auth is rejected', async () => {
  await withGateway(async port => {
    const result = await openWebSocket(port);
    assert.equal(result.statusCode, 401);
  });
});

test('WebSocket handshake with wrong Basic Auth is rejected', async () => {
  await withGateway(async port => {
    const result = await openWebSocket(port, basicHeader('test-exotel-user', 'wrong-password'));
    assert.equal(result.statusCode, 401);
  });
});

test('WebSocket handshake without Basic Auth is accepted when EXOTEL_ALLOW_UNAUTHENTICATED_WS is true', async () => {
  const original = env.EXOTEL_ALLOW_UNAUTHENTICATED_WS;
  env.EXOTEL_ALLOW_UNAUTHENTICATED_WS = true;
  try {
    await withGateway(async port => {
      const result = await openWebSocket(port);
      assert.equal(result.statusCode, 101);
      result.socket.close();
    });
  } finally {
    env.EXOTEL_ALLOW_UNAUTHENTICATED_WS = original;
  }
});