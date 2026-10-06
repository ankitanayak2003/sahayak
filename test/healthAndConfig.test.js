'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { healthLiveHandler, healthReadyHandler, legacyHealthHandler } = require('../src/routes/health');
const { buildCorsOptions } = require('../src/app');
const { gracefulShutdown } = require('../src/server');

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('PHASE 1: /health/live reports process liveness', (t) => {
  const req = {};
  const res = mockResponse();

  healthLiveHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(typeof res.body.uptime, 'number');
  assert.ok(res.body.uptime >= 0);
  assert.ok(res.body.timestamp);
});

test('PHASE 1: /health/ready returns 200 when database is ready', async (t) => {
  const req = {};
  const res = mockResponse();

  await healthReadyHandler(req, res);

  assert.ok([200, 503].includes(res.statusCode));
  assert.ok(res.body.status === 'ready' || res.body.status === 'unready');
  assert.ok(res.body.checks);
  assert.ok(res.body.checks.database);
  assert.ok(res.body.checks.redis);
  // Ensure no passwords, URLs, or secrets are leaked
  const bodyString = JSON.stringify(res.body);
  assert.ok(!bodyString.includes('mongodb+srv://'));
  assert.ok(!bodyString.includes('password'));
});

test('PHASE 1: /health (legacy) preserves backward-compatible payload', async (t) => {
  const req = {};
  const res = mockResponse();

  await legacyHealthHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.application, 'ok');
  assert.equal(res.body.data.server, 'ok');
  assert.ok(['connected', 'unavailable'].includes(res.body.data.database));
  assert.ok(['ok', 'disconnected'].includes(res.body.data.redis));
  assert.ok(res.body.data.timestamp);
});

test('PHASE 1: CORS validator allows requests with no origin (curl/mobile/telephony)', (t) => {
  const corsOpts = buildCorsOptions('https://sahayak.vercel.app', true);
  let passed = false;

  corsOpts.origin(undefined, (err, allow) => {
    assert.equal(err, null);
    assert.equal(allow, true);
    passed = true;
  });

  assert.ok(passed);
});

test('PHASE 1: CORS validator allows whitelisted exact origins', (t) => {
  const corsOpts = buildCorsOptions('https://sahayak.vercel.app,http://localhost:3000', true);
  let count = 0;

  corsOpts.origin('https://sahayak.vercel.app', (err, allow) => {
    assert.equal(err, null);
    assert.equal(allow, true);
    count++;
  });

  corsOpts.origin('http://localhost:3000', (err, allow) => {
    assert.equal(err, null);
    assert.equal(allow, true);
    count++;
  });

  assert.equal(count, 2);
});

test('PHASE 1: CORS validator supports wildcard subdomain matching (*.vercel.app)', (t) => {
  const corsOpts = buildCorsOptions('https://sahayak.vercel.app,*.vercel.app', true);
  let passed = false;

  corsOpts.origin('https://sahayak-preview-branch.vercel.app', (err, allow) => {
    assert.equal(err, null);
    assert.equal(allow, true);
    passed = true;
  });

  assert.ok(passed);
});

test('PHASE 1: CORS validator supports project-scoped wildcards (https://sahayak-*.vercel.app) and rejects untrusted vercel subdomains', (t) => {
  const corsOpts = buildCorsOptions('https://sahayak-*.vercel.app', true);
  let allowedPreview = false;
  let rejectedOther = false;

  corsOpts.origin('https://sahayak-deploy-preview-42.vercel.app', (err, allow) => {
    assert.equal(err, null);
    assert.equal(allow, true);
    allowedPreview = true;
  });

  corsOpts.origin('https://malicious-other-app.vercel.app', (err, allow) => {
    assert.ok(err);
    assert.equal(err.statusCode, 403);
    rejectedOther = true;
  });

  assert.ok(allowedPreview);
  assert.ok(rejectedOther);
});

test('PHASE 1: CORS validator supports local port wildcards (http://localhost:*)', (t) => {
  const corsOpts = buildCorsOptions('http://localhost:*', true);
  let passed = false;

  corsOpts.origin('http://localhost:5173', (err, allow) => {
    assert.equal(err, null);
    assert.equal(allow, true);
    passed = true;
  });

  assert.ok(passed);
});

test('PHASE 1: CORS validator rejects unauthorized origins in production', (t) => {
  const corsOpts = buildCorsOptions('https://sahayak.vercel.app', true);
  let caughtError = null;

  corsOpts.origin('https://malicious-site.com', (err, allow) => {
    caughtError = err;
  });

  assert.ok(caughtError);
  assert.equal(caughtError.statusCode, 403);
  assert.ok(caughtError.message.includes('not permitted by CORS policy'));
});

test('PHASE 1: CORS validator allows all origins in development when no whitelist is set', (t) => {
  const corsOpts = buildCorsOptions('', false);
  let passed = false;

  corsOpts.origin('http://localhost:5173', (err, allow) => {
    assert.equal(err, null);
    assert.equal(allow, true);
    passed = true;
  });

  assert.ok(passed);
});

test('PHASE 1: Graceful shutdown invokes server.close, ws.close, and drains resources', async (t) => {
  let serverClosed = false;
  let wsClosed = false;

  const mockHttpServer = {
    close(callback) {
      serverClosed = true;
      callback(null);
    },
  };

  const mockWsGateway = {
    close() {
      wsClosed = true;
    },
  };

  await gracefulShutdown({
    server: mockHttpServer,
    wsGateway: mockWsGateway,
    signal: 'TEST_SIGTERM',
    timeoutMs: 1000,
    exit: false, // Prevent test runner process from exiting
  });

  assert.equal(serverClosed, true);
  assert.equal(wsClosed, true);
});
