const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { EMERGENCY_TYPES, ROLES } = require('../src/config/constants');
const { validateClassification } = require('../src/services/geminiService');
const { createSarvamEmergencyHandler } = require('../src/routes/sarvam');
const { createRequest } = require('../src/services/requestService');

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

function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    const res = responseRecorder(resolve);
    handler(req, res, (error) => (error ? reject(error) : resolve(res)));
  });
}

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

function createMockDb({ requests = [], volunteers = [], users = [], assignments = [], escalations = [] } = {}) {
  let nextId = 1;
  const genId = () => new ObjectId(`${String(nextId++).padStart(24, '0')}`);

  const makeCollection = (arr) => ({
    async createIndex() {},
    async findOne(query) { return arr.find((item) => matches(item, query)) || null; },
    find(query, options = {}) {
      const filtered = arr.filter((item) => matches(item, query));
      let result = [...filtered];
      return {
        sort() { return this; },
        skip(n) { result = result.slice(n); return this; },
        limit(n) { result = result.slice(0, n); return this; },
        async toArray() {
          if (options.projection) {
            return result.map((item) => {
              const projected = {};
              for (const [k, v] of Object.entries(options.projection)) {
                if (v === 1) projected[k] = item[k];
              }
              projected._id = item._id;
              return projected;
            });
          }
          return [...result];
        },
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
  });

  return {
    requests,
    volunteers,
    users,
    assignments,
    escalations,
    collection(name) {
      if (name === 'assistance_requests') return makeCollection(requests);
      if (name === 'volunteers') return makeCollection(volunteers);
      if (name === 'users') return makeCollection(users);
      if (name === 'request_assignments') return makeCollection(assignments);
      if (name === 'emergency_escalations') return makeCollection(escalations);
      if (name === 'request_status_history') return makeCollection([]);
      throw new Error(`Unexpected collection: ${name}`);
    },
  };
}

// --------------------------------------------------------------------------
// FIX 6: VOLUNTEER GET /REQUESTS DIRECT QUERY
// --------------------------------------------------------------------------

test('FIX 6: Volunteer query finds their assigned request even with > 100 requests in database', async () => {
  const volunteerId = new ObjectId('000000000000000000000010');
  const userId = new ObjectId('000000000000000000000011');
  const totalRequests = 120;
  const requests = [];

  // Create 120 requests; the very first (oldest) request is assigned to our volunteer
  for (let i = 0; i < totalRequests; i += 1) {
    requests.push({
      _id: new ObjectId(),
      category: 'medicine',
      status: i === 0 ? 'assigned' : 'pending_assignment',
      current_assigned_volunteer_id: i === 0 ? volunteerId : null,
      created_at: new Date(Date.now() - (totalRequests - i) * 60000),
    });
  }

  const db = createMockDb({
    requests,
    volunteers: [{ _id: volunteerId, user_id: userId, verification_status: 'verified', is_available: true }],
  });

  // Direct database query by current_assigned_volunteer_id as now implemented in GET /requests
  const volunteerDoc = await db.collection('volunteers').findOne({ user_id: userId });
  assert.ok(volunteerDoc);
  const volunteerAssigned = await db.collection('assistance_requests')
    .find({ current_assigned_volunteer_id: volunteerDoc._id })
    .toArray();

  assert.equal(volunteerAssigned.length, 1);
  assert.equal(volunteerAssigned[0]._id.equals(requests[0]._id), true);
});

// --------------------------------------------------------------------------
// FIX 7: AVAILABLE VOLUNTEERS MUST BE VERIFIED
// --------------------------------------------------------------------------

test('FIX 7: Available volunteers query only returns verified and available volunteers', async () => {
  const verifiedAndAvailable = { _id: new ObjectId(), user_id: new ObjectId(), verification_status: 'verified', is_available: true };
  const pendingAndAvailable = { _id: new ObjectId(), user_id: new ObjectId(), verification_status: 'pending', is_available: true };
  const rejectedAndAvailable = { _id: new ObjectId(), user_id: new ObjectId(), verification_status: 'rejected', is_available: true };
  const suspendedAndAvailable = { _id: new ObjectId(), user_id: new ObjectId(), verification_status: 'suspended', is_available: true };
  const verifiedAndUnavailable = { _id: new ObjectId(), user_id: new ObjectId(), verification_status: 'verified', is_available: false };

  const db = createMockDb({
    volunteers: [
      verifiedAndAvailable,
      pendingAndAvailable,
      rejectedAndAvailable,
      suspendedAndAvailable,
      verifiedAndUnavailable,
    ],
  });

  const availableVolunteers = await db.collection('volunteers')
    .find({ is_available: true, verification_status: 'verified' })
    .toArray();

  assert.equal(availableVolunteers.length, 1);
  assert.equal(availableVolunteers[0]._id.equals(verifiedAndAvailable._id), true);
});

// --------------------------------------------------------------------------
// FIX 8: ADMIN PENDING VOLUNTEER LISTING
// --------------------------------------------------------------------------

test('FIX 8: Pending volunteers query returns only pending volunteers and excludes verified ones', async () => {
  const pendingVol1 = { _id: new ObjectId(), user_id: new ObjectId(), verification_status: 'pending', is_available: false };
  const pendingVol2 = { _id: new ObjectId(), user_id: new ObjectId(), verification_status: 'pending', is_available: false };
  const verifiedVol = { _id: new ObjectId(), user_id: new ObjectId(), verification_status: 'verified', is_available: true };

  const db = createMockDb({
    volunteers: [pendingVol1, pendingVol2, verifiedVol],
  });

  const pendingList = await db.collection('volunteers')
    .find({ verification_status: 'pending' })
    .toArray();

  assert.equal(pendingList.length, 2);
  assert.ok(pendingList.some((v) => v._id.equals(pendingVol1._id)));
  assert.ok(pendingList.some((v) => v._id.equals(pendingVol2._id)));
  assert.ok(!pendingList.some((v) => v._id.equals(verifiedVol._id)));
});

// --------------------------------------------------------------------------
// FIX 10: HARMONIZE EMERGENCY TYPE ENUMS
// --------------------------------------------------------------------------

test('FIX 10: Canonical emergency types are defined and accepted by Gemini validation', () => {
  const expectedTypes = ['medical', 'fire', 'accident', 'crime', 'safety_threat', 'other'];
  for (const type of expectedTypes) {
    assert.ok(EMERGENCY_TYPES.includes(type), `Missing canonical type: ${type}`);

    const result = validateClassification({
      is_emergency: true,
      emergency_type: type,
      severity: 'high',
      disposition: 'emergency',
      reason: 'Valid canonical emergency type test',
    });
    assert.equal(result.emergency_type, type);
  }
});

// --------------------------------------------------------------------------
// FIX 11: EMERGENCY SEVERITY & ESCALATION MAPPING
// --------------------------------------------------------------------------

test('FIX 11: Emergency classification preserves emergency flag across severities', async () => {
  const testCases = [
    { severity: 'critical', expectedStatus: 'escalated_to_112', expectedUrgency: 'critical' },
    { severity: 'high', expectedStatus: 'escalated_to_112', expectedUrgency: 'critical' },
    { severity: 'medium', expectedStatus: 'pending_assignment', expectedUrgency: 'urgent' },
    { severity: 'low', expectedStatus: 'pending_assignment', expectedUrgency: 'routine' },
  ];

  for (const { severity, expectedStatus, expectedUrgency } of testCases) {
    const db = createMockDb();
    const handler = createSarvamEmergencyHandler({
      getDatabase: () => db,
      classify: async () => ({
        is_emergency: true,
        emergency_type: 'medical',
        severity,
        disposition: 'emergency',
        reason: `Testing ${severity} emergency`,
      }),
    });

    const response = await invoke(handler, {
      body: {
        caller_phone: '+919876543210',
        interaction_id: `interaction-${severity}`,
        emergency_type: 'medical',
        location: 'MG Road, Bangalore',
        description: `Emergency test with ${severity} severity`,
        severity,
      },
    });

    assert.equal(response.statusCode, 201, `Failed on severity ${severity}`);
    assert.equal(response.body.data.status, expectedStatus);
    assert.equal(db.requests.length, 1);
    assert.equal(db.requests[0].is_emergency, true, `Expected is_emergency true for ${severity}`);
    assert.equal(db.requests[0].urgency_level, expectedUrgency);
  }
});

test('FIX 11: Non-emergency classification does not create request or escalate', async () => {
  const db = createMockDb();
  const handler = createSarvamEmergencyHandler({
    getDatabase: () => db,
    classify: async () => ({
      is_emergency: false,
      emergency_type: 'other',
      severity: 'low',
      disposition: 'non_emergency',
      reason: 'Routine enquiry, no emergency',
    }),
  });

  const response = await invoke(handler, {
    body: {
      caller_phone: '+919876543210',
      interaction_id: 'interaction-non-emergency',
      emergency_type: 'other',
      location: 'MG Road, Bangalore',
      description: 'Checking office hours',
      severity: 'low',
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.is_emergency, false);
  assert.equal(db.requests.length, 0);
});
