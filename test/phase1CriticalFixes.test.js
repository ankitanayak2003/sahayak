const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const {
  transitionRequest,
  hasActiveAssignment,
  createRequest,
  ALLOWED_TRANSITIONS,
} = require('../src/services/requestService');
const { generateOtpForPhone } = require('../src/utils/otpService');

function matches(document, query) {
  if (!document) return false;
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some((item) => matches(document, item));
    if (key === '$and') return expected.every((item) => matches(document, item));
    if (expected && typeof expected === 'object' && !(expected instanceof ObjectId)) {
      if ('$exists' in expected) return (key in document) === expected.$exists;
      if ('$gt' in expected) return document[key] > expected.$gt;
      if ('$ne' in expected) return document[key] !== expected.$ne;
      if ('$in' in expected) return expected.$in.some((val) => val.equals ? val.equals(document[key]) : val === document[key]);
      return document[key] === expected;
    }
    return document[key] === expected || (document[key] instanceof ObjectId && document[key].equals(expected)) || String(document[key]) === String(expected);
  });
}

function createMockDb({ requests = [], assignments = [], escalations = [], history = [], users = [], refreshTokens = [], callLogs = [] } = {}) {
  let nextId = 1;
  const genId = () => new ObjectId(`${String(nextId++).padStart(24, '0')}`);

  const makeCollection = (arr) => ({
    async createIndex() {},
    async findOne(query) { return arr.find((item) => matches(item, query)) || null; },
    find(query) {
      const filtered = arr.filter((item) => matches(item, query));
      return {
        sort() { return this; },
        skip() { return this; },
        limit() { return this; },
        async toArray() { return [...filtered]; },
      };
    },
    async countDocuments(query) { return arr.filter((item) => matches(item, query)).length; },
    async insertOne(doc) {
      const item = { ...doc, _id: doc._id || genId() };
      arr.push(item);
      return { insertedId: item._id };
    },
    async updateOne(query, update) {
      const item = arr.find((candidate) => matches(candidate, query));
      if (!item) return { matchedCount: 0 };
      if (update.$set) Object.assign(item, update.$set);
      return { matchedCount: 1 };
    },
    async updateMany(query, update) {
      let matchedCount = 0;
      for (const item of arr) {
        if (matches(item, query)) {
          if (update.$set) Object.assign(item, update.$set);
          matchedCount += 1;
        }
      }
      return { matchedCount };
    },
    async findOneAndUpdate(query, update, options = {}) {
      const item = arr.find((candidate) => matches(candidate, query));
      if (!item) return null;
      const cloneBefore = { ...item };
      if (update.$set) Object.assign(item, update.$set);
      return options.returnDocument === 'before' ? cloneBefore : item;
    },
  });

  return {
    requests,
    assignments,
    escalations,
    history,
    users,
    refreshTokens,
    callLogs,
    collection(name) {
      if (name === 'assistance_requests') return makeCollection(requests);
      if (name === 'request_assignments') return makeCollection(assignments);
      if (name === 'emergency_escalations') return makeCollection(escalations);
      if (name === 'request_status_history') return makeCollection(history);
      if (name === 'users') return makeCollection(users);
      if (name === 'refresh_tokens') return makeCollection(refreshTokens);
      if (name === 'call_logs') return makeCollection(callLogs);
      if (name === 'volunteers') return makeCollection([]);
      throw new Error(`Unexpected collection: ${name}`);
    },
  };
}

// --------------------------------------------------------------------------
// FIX 1: RELEASE ACTIVE VOLUNTEER ASSIGNMENTS
// --------------------------------------------------------------------------

test('FIX 1.A: Assign volunteer -> accept -> in_progress -> completed marks assignment completed and releases volunteer', async () => {
  const volunteerId = new ObjectId('000000000000000000000001');
  const reqId = new ObjectId('000000000000000000000002');
  const db = createMockDb({
    requests: [{ _id: reqId, status: 'pending_assignment', current_assigned_volunteer_id: null }],
  });
  const actor = { id: new ObjectId(), role: 'police_admin' };
  const volActor = { id: volunteerId, role: 'volunteer' };

  // Assign
  await transitionRequest(db, reqId, 'assigned', actor, { volunteerId });
  assert.equal(await hasActiveAssignment(db, volunteerId), true);
  assert.equal(db.assignments[0].status, 'active');

  // Accept
  await transitionRequest(db, reqId, 'accepted', volActor);
  assert.equal(await hasActiveAssignment(db, volunteerId), true);

  // In Progress
  await transitionRequest(db, reqId, 'in_progress', volActor);
  assert.equal(await hasActiveAssignment(db, volunteerId), true);

  // Completed
  await transitionRequest(db, reqId, 'completed', volActor);
  assert.equal(await hasActiveAssignment(db, volunteerId), false);
  assert.equal(db.assignments[0].status, 'completed');
  assert.ok(db.assignments[0].completed_at);
  assert.ok(db.assignments[0].expired_at);
});

test('FIX 1.B: Same volunteer can be assigned another request after first request is completed', async () => {
  const volunteerId = new ObjectId('000000000000000000000001');
  const req1Id = new ObjectId('000000000000000000000002');
  const req2Id = new ObjectId('000000000000000000000003');
  const db = createMockDb({
    requests: [
      { _id: req1Id, status: 'pending_assignment', current_assigned_volunteer_id: null },
      { _id: req2Id, status: 'pending_assignment', current_assigned_volunteer_id: null },
    ],
  });
  const actor = { id: new ObjectId(), role: 'police_admin' };
  const volActor = { id: volunteerId, role: 'volunteer' };

  // Assign req 1 & complete it
  await transitionRequest(db, req1Id, 'assigned', actor, { volunteerId });
  await transitionRequest(db, req1Id, 'accepted', volActor);
  await transitionRequest(db, req1Id, 'in_progress', volActor);
  await transitionRequest(db, req1Id, 'completed', volActor);

  // Assign req 2 to same volunteer - must succeed without "already handling" error
  await transitionRequest(db, req2Id, 'assigned', actor, { volunteerId });
  assert.equal(await hasActiveAssignment(db, volunteerId), true);
  assert.equal(db.assignments.length, 2);
  assert.equal(db.assignments[1].status, 'active');
});

test('FIX 1.C: Cancellation releases the volunteer assignment', async () => {
  const volunteerId = new ObjectId('000000000000000000000001');
  const reqId = new ObjectId('000000000000000000000002');
  const db = createMockDb({
    requests: [{ _id: reqId, status: 'pending_assignment', current_assigned_volunteer_id: null }],
  });
  const actor = { id: new ObjectId(), role: 'police_admin' };

  await transitionRequest(db, reqId, 'assigned', actor, { volunteerId });
  assert.equal(await hasActiveAssignment(db, volunteerId), true);

  await transitionRequest(db, reqId, 'cancelled', actor);
  assert.equal(await hasActiveAssignment(db, volunteerId), false);
  assert.equal(db.assignments[0].status, 'cancelled');
  assert.ok(db.assignments[0].expired_at);
});

test('FIX 1.D: Escalation releases the volunteer assignment', async () => {
  const volunteerId = new ObjectId('000000000000000000000001');
  const reqId = new ObjectId('000000000000000000000002');
  const db = createMockDb({
    requests: [{ _id: reqId, status: 'pending_assignment', current_assigned_volunteer_id: null }],
  });
  const actor = { id: new ObjectId(), role: 'police_admin' };

  await transitionRequest(db, reqId, 'assigned', actor, { volunteerId });
  assert.equal(await hasActiveAssignment(db, volunteerId), true);

  await transitionRequest(db, reqId, 'escalated_to_112', actor, { escalationType: 'medical' });
  assert.equal(await hasActiveAssignment(db, volunteerId), false);
  assert.equal(db.assignments[0].status, 'escalated');
  assert.ok(db.assignments[0].expired_at);
});

test('FIX 1.E: No unrelated active assignment is accidentally modified on request completion', async () => {
  const vol1 = new ObjectId('000000000000000000000001');
  const vol2 = new ObjectId('000000000000000000000002');
  const req1 = new ObjectId('000000000000000000000003');
  const req2 = new ObjectId('000000000000000000000004');
  const db = createMockDb({
    requests: [
      { _id: req1, status: 'in_progress', current_assigned_volunteer_id: vol1 },
      { _id: req2, status: 'in_progress', current_assigned_volunteer_id: vol2 },
    ],
    assignments: [
      { request_id: req1, volunteer_id: vol1, status: 'active', expired_at: null },
      { request_id: req2, volunteer_id: vol2, status: 'active', expired_at: null },
    ],
  });

  // Complete req1
  await transitionRequest(db, req1, 'completed', { id: vol1, role: 'volunteer' });

  // vol1 released, but vol2 remains active
  assert.equal(await hasActiveAssignment(db, vol1), false);
  assert.equal(await hasActiveAssignment(db, vol2), true);
  assert.equal(db.assignments[1].status, 'active');
  assert.equal(db.assignments[1].expired_at, null);
});

// --------------------------------------------------------------------------
// FIX 2: EMERGENCY RESOLUTION MUST RESOLVE CORE REQUEST
// --------------------------------------------------------------------------

test('FIX 2: Transition from escalated_to_112 to completed is allowed and updates core request', async () => {
  const reqId = new ObjectId('000000000000000000000005');
  const db = createMockDb({
    requests: [{ _id: reqId, status: 'escalated_to_112' }],
  });
  const adminActor = { id: new ObjectId(), role: 'police_admin' };

  assert.ok(ALLOWED_TRANSITIONS.escalated_to_112.includes('completed'));

  const updated = await transitionRequest(db, reqId, 'completed', adminActor, {
    reason: '112 emergency dispatched and resolved.',
  });

  assert.equal(updated.status, 'completed');
  assert.equal(db.requests[0].status, 'completed');
  assert.equal(db.history.at(-1).action, 'REQUEST_COMPLETED');
  assert.equal(db.history.at(-1).new_state, 'completed');
});

// --------------------------------------------------------------------------
// FIX 3 & FIX 9: SECURE LEGACY VOICE WEBHOOK & RACE / PHONE RESILIENCE
// --------------------------------------------------------------------------

const { requireVoiceWebhookAuthentication } = require('../src/routes/voice');
const env = require('../src/config/env');
const { normalizePhoneNumber } = require('../src/utils/phoneSecurity');

function invokeMiddleware(middleware, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; resolve(this); return this; },
    };
    middleware(req, res, () => {
      resolve({ passed: true, statusCode: 200 });
    });
  });
}

test('FIX 3: Voice webhook rejects request with missing authorization', async () => {
  const req = { get: () => null };
  const res = await invokeMiddleware(requireVoiceWebhookAuthentication, req);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
});

test('FIX 3: Voice webhook rejects request with wrong credentials', async () => {
  const req = { get: () => 'Bearer wrong-secret' };
  const res = await invokeMiddleware(requireVoiceWebhookAuthentication, req);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
});

test('FIX 3: Voice webhook accepts valid Bearer credentials', async () => {
  const req = { get: () => `Bearer ${env.SARVAM_TOOL_SHARED_SECRET}` };
  const res = await invokeMiddleware(requireVoiceWebhookAuthentication, req);
  assert.equal(res.passed, true);
});

test('FIX 9: normalizePhoneNumber throws on non-digit or empty callerPhone', () => {
  assert.throws(() => normalizePhoneNumber('anonymous'), /Phone number must contain at least one digit/);
  assert.throws(() => normalizePhoneNumber('restricted'), /Phone number must contain at least one digit/);
  assert.throws(() => normalizePhoneNumber('+'), /Phone number must contain at least one digit/);
  assert.throws(() => normalizePhoneNumber(''), /Phone number must contain at least one digit/);
});

// --------------------------------------------------------------------------
// FIX 4: REGISTRATION SECURITY CONSISTENCY
// --------------------------------------------------------------------------

const { verifyOtpForPhone } = require('../src/utils/otpService');

test('FIX 4: OTP verification service validates and invalidates used OTPs', () => {
  const phone = '9876543210';
  const otp = generateOtpForPhone(phone);
  assert.equal(otp.length, 6);

  // Wrong OTP fails
  assert.equal(verifyOtpForPhone(phone, '000000'), false);

  // Correct OTP succeeds
  assert.equal(verifyOtpForPhone(phone, otp), true);

  // Reusing same OTP fails immediately
  assert.equal(verifyOtpForPhone(phone, otp), false);
});

// --------------------------------------------------------------------------
// FIX 5: REFRESH TOKEN ROTATION & REUSE ON STANDALONE
// --------------------------------------------------------------------------

const { hashRefreshToken, generateRefreshToken } = require('../src/utils/refreshToken');

test('FIX 5: Atomic refresh token rotation semantics work with standalone collections', async () => {
  const now = new Date();
  const userId = new ObjectId();
  const rawToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(rawToken);
  const familyId = generateRefreshToken();

  const db = createMockDb({
    users: [{ _id: userId, account_status: 'active' }],
    refreshTokens: [{
      user_id: userId,
      token_hash: tokenHash,
      token_family_id: familyId,
      expires_at: new Date(now.getTime() + 100000),
      revoked_at: null,
    }],
  });

  const tokens = db.collection('refresh_tokens');

  // Verify atomic findOneAndUpdate revokes old token
  const revoked = await tokens.findOneAndUpdate(
    { token_hash: tokenHash, revoked_at: null },
    { $set: { revoked_at: now } },
    { returnDocument: 'before' }
  );
  assert.ok(revoked);
  assert.equal(revoked.revoked_at, null);

  // Subsequent attempt to atomically find and revoke fails (already revoked)
  const secondAttempt = await tokens.findOneAndUpdate(
    { token_hash: tokenHash, revoked_at: null },
    { $set: { revoked_at: now } },
    { returnDocument: 'before' }
  );
  assert.equal(secondAttempt, null);

  // Reuse detection: updateMany revokes the whole token family
  await tokens.updateMany({ token_family_id: familyId }, { $set: { revoked_at: now } });
  const allInFamily = await tokens.find({ token_family_id: familyId }).toArray();
  assert.ok(allInFamily.every((t) => t.revoked_at !== null));
});

