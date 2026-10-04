'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { ROLES } = require('../src/config/constants');
const {
  createRequest,
  transitionRequest,
  assignOrQueueVolunteer,
  autoAssignRequest,
  promoteNextQueuedAssignment,
  rejectAssignment,
  handleVolunteerAvailabilityChange,
  REQUEST_STATUSES,
} = require('../src/services/requestService');
const {
  selectEligibleVolunteer,
  getVolunteerWorkload,
} = require('../src/services/volunteerAssignmentService');
const {
  createVerifiedVolunteersHandler,
  createAvailableVolunteersHandler,
  createUpdateAvailabilityHandler,
} = require('../src/routes/volunteerBusiness');

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
      if ('$in' in expected) {
        return expected.$in.some((val) =>
          val.equals ? val.equals(document[key]) : String(val) === String(document[key])
        );
      }
      if ('$ne' in expected) return document[key] !== expected.$ne;
      return document[key] === expected;
    }
    return (
      document[key] === expected ||
      (document[key] instanceof ObjectId && document[key].equals(expected)) ||
      String(document[key]) === String(expected)
    );
  });
}

function createMockDb({
  requests = [],
  volunteers = [],
  assignments = [],
  history = [],
  users = null,
} = {}) {
  let nextId = 100;
  const genId = () => new ObjectId(`${String(nextId++).padStart(24, '0')}`);

  const makeCollection = (arr) => ({
    async createIndex() {},
    async findOne(query) {
      return arr.find((item) => matches(item, query)) || null;
    },
    find(query, options = {}) {
      const filtered = arr.filter((item) => matches(item, query));
      let result = [...filtered];
      return {
        sort(sortSpec) {
          if (sortSpec) {
            result.sort((a, b) => {
              for (const [k, dir] of Object.entries(sortSpec)) {
                if (a[k] !== b[k]) {
                  return dir === 1
                    ? (a[k] > b[k] ? 1 : -1)
                    : (a[k] < b[k] ? 1 : -1);
                }
              }
              return 0;
            });
          }
          return this;
        },
        skip(n) {
          result = result.slice(n);
          return this;
        },
        limit(n) {
          result = result.slice(0, n);
          return this;
        },
        async toArray() {
          if (options.projection) {
            return result.map((item) => {
              const proj = {};
              for (const [k, v] of Object.entries(options.projection)) {
                if (v === 1) proj[k] = item[k];
              }
              proj._id = item._id;
              return proj;
            });
          }
          return [...result];
        },
      };
    },
    async countDocuments(query) {
      return arr.filter((item) => matches(item, query)).length;
    },
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
          matchedCount++;
        }
      }
      return { matchedCount };
    },
  });

  const effectiveUsers = users !== null
    ? users
    : volunteers
        .filter((v) => v.user_id)
        .map((v) => ({ _id: v.user_id, account_status: 'active', role: ROLES.VOLUNTEER, name: 'Test Volunteer' }));

  return {
    requests,
    volunteers,
    assignments,
    history,
    users: effectiveUsers,
    collection(name) {
      if (name === 'assistance_requests') return makeCollection(requests);
      if (name === 'volunteers') return makeCollection(volunteers);
      if (name === 'request_assignments') return makeCollection(assignments);
      if (name === 'request_status_history') return makeCollection(history);
      if (name === 'users') return makeCollection(effectiveUsers);
      throw new Error(`Unexpected collection: ${name}`);
    },
  };
}

// ---------------------------------------------------------------------------
// A. AVAILABILITY TESTS
// ---------------------------------------------------------------------------

test('A1. verified volunteer can turn availability ON and backend persists change', async () => {
  const userId = new ObjectId('000000000000000000000001');
  const volId = new ObjectId('000000000000000000000002');
  const mockDb = createMockDb({
    volunteers: [{ _id: volId, user_id: userId, verification_status: 'verified', is_available: false }],
    users: [{ _id: userId, name: 'Alice Volunteer', role: ROLES.VOLUNTEER }],
  });

  const handler = createUpdateAvailabilityHandler({ getDatabase: () => mockDb });
  const req = {
    params: { id: 'me' },
    user: { id: String(userId), role: ROLES.VOLUNTEER },
    body: { is_available: true },
  };

  const res = await invoke(handler, req);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.is_available, true);
  assert.equal(res.body.data.isAvailable, true);

  const updatedVol = await mockDb.collection('volunteers').findOne({ _id: volId });
  assert.equal(updatedVol.is_available, true);
});

test('A2. verified volunteer can turn availability OFF and backend persists change', async () => {
  const userId = new ObjectId('000000000000000000000001');
  const volId = new ObjectId('000000000000000000000002');
  const mockDb = createMockDb({
    volunteers: [{ _id: volId, user_id: userId, verification_status: 'verified', is_available: true }],
    users: [{ _id: userId, name: 'Alice Volunteer', role: ROLES.VOLUNTEER }],
  });

  const handler = createUpdateAvailabilityHandler({ getDatabase: () => mockDb });
  const req = {
    params: { id: String(volId) },
    user: { id: String(userId), role: ROLES.VOLUNTEER },
    body: { is_available: false },
  };

  const res = await invoke(handler, req);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.is_available, false);
  assert.equal(res.body.data.isAvailable, false);

  const updatedVol = await mockDb.collection('volunteers').findOne({ _id: volId });
  assert.equal(updatedVol.is_available, false);
});

test('A3. unauthorized user cannot change another volunteer availability', async () => {
  const victimUserId = new ObjectId('000000000000000000000001');
  const attackerUserId = new ObjectId('000000000000000000000009');
  const volId = new ObjectId('000000000000000000000002');
  const mockDb = createMockDb({
    volunteers: [{ _id: volId, user_id: victimUserId, verification_status: 'verified', is_available: true }],
  });

  const handler = createUpdateAvailabilityHandler({ getDatabase: () => mockDb });
  const req = {
    params: { id: String(volId) },
    user: { id: String(attackerUserId), role: ROLES.VOLUNTEER },
    body: { is_available: false },
  };

  const res = await invoke(handler, req);
  assert.equal(res.statusCode, 403);
  const vol = await mockDb.collection('volunteers').findOne({ _id: volId });
  assert.equal(vol.is_available, true); // Still unchanged
});

test('A4. invalid availability payload is rejected and persists no change', async () => {
  const userId = new ObjectId('000000000000000000000001');
  const volId = new ObjectId('000000000000000000000002');
  const mockDb = createMockDb({
    volunteers: [{ _id: volId, user_id: userId, verification_status: 'verified', is_available: false }],
  });

  const handler = createUpdateAvailabilityHandler({ getDatabase: () => mockDb });
  const req = {
    params: { id: String(volId) },
    user: { id: String(userId), role: ROLES.VOLUNTEER },
    body: { is_available: 'maybe' }, // Invalid non-boolean
  };

  const res = await invoke(handler, req);
  assert.equal(res.statusCode, 400);
  const vol = await mockDb.collection('volunteers').findOne({ _id: volId });
  assert.equal(vol.is_available, false);
});

// ---------------------------------------------------------------------------
// B. VOLUNTEER MANAGEMENT TESTS
// ---------------------------------------------------------------------------

test('B1. admin sees both available and unavailable verified volunteers, but not pending', async () => {
  const user1 = new ObjectId('000000000000000000000001');
  const user2 = new ObjectId('000000000000000000000002');
  const user3 = new ObjectId('000000000000000000000003');

  const volAvailable = { _id: new ObjectId(), user_id: user1, verification_status: 'verified', is_available: true };
  const volUnavailable = { _id: new ObjectId(), user_id: user2, verification_status: 'verified', is_available: false };
  const volPending = { _id: new ObjectId(), user_id: user3, verification_status: 'pending', is_available: false };

  const mockDb = createMockDb({
    volunteers: [volAvailable, volUnavailable, volPending],
    users: [
      { _id: user1, name: 'Available Vol', role: ROLES.VOLUNTEER },
      { _id: user2, name: 'Unavailable Vol', role: ROLES.VOLUNTEER },
      { _id: user3, name: 'Pending Vol', role: ROLES.VOLUNTEER },
    ],
  });

  const handler = createVerifiedVolunteersHandler({ getDatabase: () => mockDb });
  const req = { user: { id: 'admin1', role: ROLES.POLICE_ADMIN }, query: {} };
  const res = await invoke(handler, req);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.volunteers.length, 2);
  const names = res.body.data.volunteers.map((v) => v.name);
  assert.ok(names.includes('Available Vol'));
  assert.ok(names.includes('Unavailable Vol'));
  assert.ok(!names.includes('Pending Vol'));
});

// ---------------------------------------------------------------------------
// C. AUTOMATIC ASSIGNMENT TESTS
// ---------------------------------------------------------------------------

test('C1. eligible volunteer is assigned automatically upon emergency creation', async () => {
  const volId = new ObjectId('000000000000000000000010');
  const userId = new ObjectId('000000000000000000000011');
  const adminId = new ObjectId('000000000000000000000012');

  const mockDb = createMockDb({
    volunteers: [{ _id: volId, user_id: userId, verification_status: 'verified', is_available: true }],
  });

  const created = await createRequest(
    mockDb,
    {
      caller_phone: '+919876543210',
      category: 'medical',
      severity: 'critical',
      location: { address: 'Sector 5, Salt Lake' },
    },
    { id: adminId, role: ROLES.POLICE_ADMIN }
  );

  assert.equal(created.status, 'assigned');
  assert.ok(created.current_assigned_volunteer_id.equals(volId));

  const assignment = await mockDb.collection('request_assignments').findOne({ request_id: created._id });
  assert.ok(assignment);
  assert.equal(assignment.status, 'active');
  assert.ok(assignment.volunteer_id.equals(volId));
});

test('C2. unverified or unavailable volunteers are NEVER automatically assigned', async () => {
  const vol1 = { _id: new ObjectId(), user_id: new ObjectId(), verification_status: 'pending', is_available: true };
  const vol2 = { _id: new ObjectId(), user_id: new ObjectId(), verification_status: 'verified', is_available: false };
  const adminId = new ObjectId();

  const mockDb = createMockDb({ volunteers: [vol1, vol2] });

  const created = await createRequest(
    mockDb,
    { caller_phone: '+919876543210', category: 'fire', severity: 'urgent' },
    { id: adminId, role: ROLES.POLICE_ADMIN }
  );

  assert.equal(created.status, 'pending_assignment');
  assert.equal(created.current_assigned_volunteer_id, null);
  const assignments = await mockDb.collection('request_assignments').find({ request_id: created._id }).toArray();
  assert.equal(assignments.length, 0);
});

// ---------------------------------------------------------------------------
// D. PER-VOLUNTEER QUEUE & LOAD BALANCING TESTS
// ---------------------------------------------------------------------------

test('D1. per-volunteer queue: same volunteer receives multiple emergencies in deterministic queue', async () => {
  const volId = new ObjectId('000000000000000000000020');
  const userId = new ObjectId('000000000000000000000021');
  const adminId = new ObjectId('000000000000000000000022');

  const mockDb = createMockDb({
    volunteers: [{ _id: volId, user_id: userId, verification_status: 'verified', is_available: true }],
  });

  // Emergency 1 -> Assigned (active)
  const req1 = await createRequest(
    mockDb,
    { caller_phone: '+919999999991', category: 'medical', severity: 'urgent' },
    { id: adminId, role: ROLES.POLICE_ADMIN }
  );
  assert.equal(req1.status, 'assigned');

  // Emergency 2 -> Queued (queue position 1)
  const req2 = await createRequest(
    mockDb,
    { caller_phone: '+919999999992', category: 'accident', severity: 'medium' },
    { id: adminId, role: ROLES.POLICE_ADMIN }
  );
  assert.equal(req2.status, 'queued');

  // Emergency 3 -> Queued (queue position 2)
  const req3 = await createRequest(
    mockDb,
    { caller_phone: '+919999999993', category: 'fire', severity: 'low' },
    { id: adminId, role: ROLES.POLICE_ADMIN }
  );
  assert.equal(req3.status, 'queued');

  // Check assignment records
  const a1 = await mockDb.collection('request_assignments').findOne({ request_id: req1._id });
  const a2 = await mockDb.collection('request_assignments').findOne({ request_id: req2._id });
  const a3 = await mockDb.collection('request_assignments').findOne({ request_id: req3._id });

  assert.equal(a1.status, 'active');
  assert.equal(a1.queue_position, 1);
  assert.equal(a2.status, 'queued');
  assert.equal(a2.queue_position, 2);
  assert.equal(a3.status, 'queued');
  assert.equal(a3.queue_position, 3);

  // Check workload
  const workload = await getVolunteerWorkload(mockDb, volId);
  assert.equal(workload.activeCount, 1);
  assert.equal(workload.queuedCount, 2);
  assert.equal(workload.totalWorkload, 3);
});

test('D2. completing current emergency promotes the next queued emergency to assigned', async () => {
  const volId = new ObjectId('000000000000000000000030');
  const userId = new ObjectId('000000000000000000000031');
  const adminId = new ObjectId('000000000000000000000032');

  const mockDb = createMockDb({
    volunteers: [{ _id: volId, user_id: userId, verification_status: 'verified', is_available: true }],
  });

  const req1 = await createRequest(mockDb, { caller_phone: '+911111111111' }, { id: adminId, role: ROLES.POLICE_ADMIN });
  const req2 = await createRequest(mockDb, { caller_phone: '+912222222222' }, { id: adminId, role: ROLES.POLICE_ADMIN });

  assert.equal(req1.status, 'assigned');
  assert.equal(req2.status, 'queued');

  // Volunteer accepts req1 -> in_progress -> completed
  const volActor = { id: userId, role: ROLES.VOLUNTEER };
  await transitionRequest(mockDb, req1._id, 'accepted', volActor);
  await transitionRequest(mockDb, req1._id, 'in_progress', volActor);
  await transitionRequest(mockDb, req1._id, 'completed', volActor);

  // Check req1 is completed and assignment closed
  const updatedReq1 = await mockDb.collection('assistance_requests').findOne({ _id: req1._id });
  assert.equal(updatedReq1.status, 'completed');

  // req2 should now be automatically promoted to assigned!
  const updatedReq2 = await mockDb.collection('assistance_requests').findOne({ _id: req2._id });
  assert.equal(updatedReq2.status, 'assigned');
  assert.ok(updatedReq2.current_assigned_volunteer_id.equals(volId));

  const a2 = await mockDb.collection('request_assignments').findOne({ request_id: req2._id });
  assert.equal(a2.status, 'active');
});

test('E1. load balancing distributes requests to volunteer with lower workload', async () => {
  const volA = { _id: new ObjectId('000000000000000000000041'), user_id: new ObjectId(), verification_status: 'verified', is_available: true };
  const volB = { _id: new ObjectId('000000000000000000000042'), user_id: new ObjectId(), verification_status: 'verified', is_available: true };
  const adminId = new ObjectId();

  const mockDb = createMockDb({ volunteers: [volA, volB] });

  // Req 1 -> assigned to volA (workload A=1, B=0)
  const req1 = await createRequest(mockDb, { caller_phone: '+910000000001' }, { id: adminId, role: ROLES.POLICE_ADMIN });
  assert.ok(req1.current_assigned_volunteer_id.equals(volA._id));

  // Req 2 -> should go to volB because B has 0 workload
  const req2 = await createRequest(mockDb, { caller_phone: '+910000000002' }, { id: adminId, role: ROLES.POLICE_ADMIN });
  assert.ok(req2.current_assigned_volunteer_id.equals(volB._id));

  // Req 3 -> workloads are equal (1 and 1), so deterministic tie-breaker selects volA
  const req3 = await createRequest(mockDb, { caller_phone: '+910000000003' }, { id: adminId, role: ROLES.POLICE_ADMIN });
  assert.ok(req3.current_assigned_volunteer_id.equals(volA._id));
  assert.equal(req3.status, 'queued');

  // Req 4 -> workload A=2, B=1, so goes to volB
  const req4 = await createRequest(mockDb, { caller_phone: '+910000000004' }, { id: adminId, role: ROLES.POLICE_ADMIN });
  assert.ok(req4.current_assigned_volunteer_id.equals(volB._id));
  assert.equal(req4.status, 'queued');
});

test('F1. when volunteer goes off-duty: active work is preserved, queued work is reassigned', async () => {
  const volBusy = { _id: new ObjectId('000000000000000000000051'), user_id: new ObjectId(), verification_status: 'verified', is_available: true };
  const volBackup = { _id: new ObjectId('000000000000000000000052'), user_id: new ObjectId(), verification_status: 'verified', is_available: true };
  const adminId = new ObjectId();

  const mockDb = createMockDb({ volunteers: [volBusy, volBackup] });

  // Req 1 assigned to volBusy
  const req1 = await createRequest(mockDb, { caller_phone: '+915555555551' }, { id: adminId, role: ROLES.POLICE_ADMIN });
  // VolBusy moves req1 to in_progress
  await transitionRequest(mockDb, req1._id, 'accepted', { id: volBusy.user_id, role: ROLES.VOLUNTEER });
  await transitionRequest(mockDb, req1._id, 'in_progress', { id: volBusy.user_id, role: ROLES.VOLUNTEER });

  // Req 2 assigned to volBackup
  await createRequest(mockDb, { caller_phone: '+915555555552' }, { id: adminId, role: ROLES.POLICE_ADMIN });

  // Req 3 queued to volBusy
  const req3 = await createRequest(mockDb, { caller_phone: '+915555555553' }, { id: adminId, role: ROLES.POLICE_ADMIN });
  assert.equal(req3.status, 'queued');
  assert.ok(req3.current_assigned_volunteer_id.equals(volBusy._id));

  // VolBusy goes off duty!
  await handleVolunteerAvailabilityChange(mockDb, volBusy._id, false, { id: volBusy.user_id, role: ROLES.VOLUNTEER });

  // Active in_progress request (req1) MUST be preserved
  const checkReq1 = await mockDb.collection('assistance_requests').findOne({ _id: req1._id });
  assert.equal(checkReq1.status, 'in_progress');
  assert.ok(checkReq1.current_assigned_volunteer_id.equals(volBusy._id));

  // Queued request (req3) MUST be reassigned away from volBusy to volBackup (or pending if no one else)
  const checkReq3 = await mockDb.collection('assistance_requests').findOne({ _id: req3._id });
  assert.ok(!checkReq3.current_assigned_volunteer_id.equals(volBusy._id));
  assert.ok(checkReq3.current_assigned_volunteer_id.equals(volBackup._id));
});
