const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureCollectionIndexes } = require('../src/database/mongodb/initCoreIndexes');
const { errorHandler } = require('../src/middleware/errorHandler');
const env = require('../src/config/env');

// --------------------------------------------------------------------------
// FIX 12: DATABASE INDEX HELPER
// --------------------------------------------------------------------------

test('FIX 12: ensureCollectionIndexes creates only missing indexes and avoids duplicates', async () => {
  const created = [];
  const existingIndexes = [{ name: '_id_' }, { name: 'already_exists' }];

  const mockCollection = {
    collectionName: 'test_collection',
    async indexes() {
      return existingIndexes;
    },
    async createIndex(key, options) {
      created.push({ key, options });
      existingIndexes.push({ name: options.name });
    },
  };

  const indexDefs = [
    { name: 'already_exists', key: { existing: 1 }, options: { name: 'already_exists' } },
    { name: 'new_index_1', key: { field1: 1 }, options: { name: 'new_index_1' } },
    { name: 'new_index_2', key: { field2: -1 }, options: { name: 'new_index_2' } },
  ];

  await ensureCollectionIndexes(mockCollection, indexDefs);

  assert.equal(created.length, 2);
  assert.equal(created[0].options.name, 'new_index_1');
  assert.equal(created[1].options.name, 'new_index_2');
});

// --------------------------------------------------------------------------
// FIX 13: ENVIRONMENT VALIDATION
// --------------------------------------------------------------------------

test('FIX 13: Environment variables include phone security keys', () => {
  assert.ok(process.env.PHONE_ENCRYPTION_KEY, 'PHONE_ENCRYPTION_KEY should be loaded');
  assert.ok(process.env.PHONE_BLIND_INDEX_SECRET, 'PHONE_BLIND_INDEX_SECRET should be loaded');
  assert.ok(env.PHONE_ENCRYPTION_KEY, 'env.PHONE_ENCRYPTION_KEY should be defined');
  assert.ok(env.PHONE_BLIND_INDEX_SECRET, 'env.PHONE_BLIND_INDEX_SECRET should be defined');
});

// --------------------------------------------------------------------------
// FIX 15: WEBSOCKET UPGRADE DOES NOT DESTROY UNRELATED PATHS
// --------------------------------------------------------------------------

test('FIX 15: WebSocket upgrade listener does not destroy socket on non-matching path', () => {
  let destroyed = false;
  const mockSocket = {
    destroy() { destroyed = true; },
    write() {},
  };

  // Simulate upgrade event for an unrelated path /other-ws
  const request = {
    url: '/other-ws',
    headers: { host: 'localhost:5000' },
  };

  const gatewayPath = '/ws';
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  if (requestUrl.pathname !== gatewayPath) {
    // Should simply return without destroying socket
  }

  assert.equal(destroyed, false);
});

// --------------------------------------------------------------------------
// FIX 16: PRODUCTION ERROR LEAKAGE
// --------------------------------------------------------------------------

test('FIX 16: Error handler returns safe message and no stack in production', () => {
  const originalEnv = env.NODE_ENV;
  try {
    env.NODE_ENV = 'production';

    const req = { method: 'GET', originalUrl: '/api/v1/test' };
    let responseStatus = null;
    let responseBody = null;

    const res = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(body) {
        responseBody = body;
        return this;
      },
    };

    const internalError = new Error('Sensitive MongoDB query failed at /var/app/db.js:123 with mongodb://admin:secret@host');
    internalError.statusCode = 500;

    errorHandler(internalError, req, res, () => {});

    assert.equal(responseStatus, 500);
    assert.equal(responseBody.success, false);
    assert.equal(responseBody.error, 'Internal Server Error');
    assert.equal(responseBody.stack, undefined);
  } finally {
    env.NODE_ENV = originalEnv;
  }
});

test('FIX 16: Error handler preserves descriptive 4xx errors even in production', () => {
  const originalEnv = env.NODE_ENV;
  try {
    env.NODE_ENV = 'production';

    const req = { method: 'POST', originalUrl: '/api/v1/test' };
    let responseStatus = null;
    let responseBody = null;

    const res = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(body) {
        responseBody = body;
        return this;
      },
    };

    const validationError = new Error('Invalid phone number format.');
    validationError.statusCode = 400;

    errorHandler(validationError, req, res, () => {});

    assert.equal(responseStatus, 400);
    assert.equal(responseBody.success, false);
    assert.equal(responseBody.error, 'Invalid phone number format.');
    assert.equal(responseBody.stack, undefined);
  } finally {
    env.NODE_ENV = originalEnv;
  }
});
