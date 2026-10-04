const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { rejectAssignment, transitionRequest } = require('../src/services/requestService');
const { selectEligibleVolunteer } = require('../src/services/volunteerAssignmentService');

function matches(document, query) {
  if (!document) return false;
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some((item) => matches(document, item));
    if (expected && typeof expected === 'object' && !(expected instanceof ObjectId)) {
      if ('$exists' in expected) return (key in document) === expected.$exists;
      return document[key] === expected;
    }
    return document[key] === expected || String(document[key]) === String(expected);
  });
}

function fakeDatabase({ requests = [], volunteers = [], assignments = [] } = {}) {
  const history = [];
  let nextAssignmentId = 1;
  const assignmentCollection = {
    async createIndex() {},
    async findOne(query) { return assignments.find((item) => matches(item, query)) || null; },
    async insertOne(document) {
      if (assignments.some((item) => item.status === 'active' && item.volunteer_id.equals(document.volunteer_id))) {
        const duplicate = new Error('duplicate active assignment');
        duplicate.code = 11000;
        throw duplicate;
      }
      const item = { ...document, _id: new ObjectId(`${String(nextAssignmentId++).padStart(24, '0')}`) };
      assignments.push(item);
      return { insertedId: item._id };
    },
    async updateOne(query, update) {
      const item = assignments.find((candidate) => matches(candidate, query));
      if (!item) return { matchedCount: 0 };
      Object.assign(item, update.$set);
      return { matchedCount: 1 };
    },
  };
  const requestCollection = {
    async findOne(query) { return requests.find((item) => matches(item, query)) || null; },
    async updateOne(query, update) {
      const request = requests.find((item) => matches(item, query));
      if (!request) return { matchedCount: 0 };
      Object.assign(request, update.$set);
      return { matchedCount: 1 };
    },
  };
  const volunteerCollection = {
    find(query) {
      const selected = volunteers.filter((item) => matches(item, query));
      return {
        sort() { return this; },
        async toArray() { return selected.sort((left, right) => String(left._id).localeCompare(String(right._id))); },
      };
    },
  };

  return {
    history,
    collection(name) {
      if (name === 'assistance_requests') return requestCollection;
      if (name === 'request_assignments') return assignmentCollection;
      if (name === 'request_status_history') return { async insertOne(item) { history.push(item); } };
      if (name === 'volunteers') return volunteerCollection;
      throw new Error(`Unexpected collection: ${name}`);
    },
  };
}

function volunteer(id, overrides = {}) {
  return { _id: new ObjectId(id), user_id: new ObjectId(), verification_status: 'verified', is_available: true, ...overrides };
}

function request(id, overrides = {}) {
  return { _id: new ObjectId(id), status: 'pending_assignment', current_assigned_volunteer_id: null, ...overrides };
}

test('selects the first verified available volunteer who is not busy', async () => {
  const unavailable = volunteer('000000000000000000000001', { is_available: false });
  const unverified = volunteer('000000000000000000000002', { verification_status: 'pending' });
  const busy = volunteer('000000000000000000000003');
  const eligible = volunteer('000000000000000000000004');
  const db = fakeDatabase({ volunteers: [eligible, busy, unavailable, unverified], assignments: [{ volunteer_id: busy._id, status: 'active', expired_at: null }] });

  assert.equal((await selectEligibleVolunteer(db))._id, eligible._id);
});

test('returns null when every volunteer is unavailable or unverified', async () => {
  const db = fakeDatabase({
    volunteers: [volunteer('000000000000000000000006', { is_available: false }), volunteer('000000000000000000000007', { verification_status: 'pending' })],
  });

  assert.equal(await selectEligibleVolunteer(db), null);
});

test('selects busy volunteer for queueing when no free volunteer exists', async () => {
  const busy = volunteer('000000000000000000000005');
  const db = fakeDatabase({
    volunteers: [busy, volunteer('000000000000000000000006', { is_available: false }), volunteer('000000000000000000000007', { verification_status: 'pending' })],
    assignments: [{ volunteer_id: busy._id, status: 'active', expired_at: null }],
  });

  const selected = await selectEligibleVolunteer(db);
  assert.equal(selected._id, busy._id);
  assert.equal(selected.hasActiveAssignment, true);
  assert.equal(selected.totalWorkload, 1);
});

test('assigns and accepts a request, then rejects a busy volunteer assignment', async () => {
  const assignedVolunteer = volunteer('000000000000000000000008');
  const otherRequest = request('000000000000000000000009');
  const targetRequest = request('00000000000000000000000a');
  const db = fakeDatabase({ requests: [otherRequest, targetRequest], volunteers: [assignedVolunteer] });
  const actor = { id: new ObjectId(), role: 'police_admin' };

  await transitionRequest(db, otherRequest._id, 'assigned', actor, { volunteerId: assignedVolunteer._id });
  await assert.rejects(
    transitionRequest(db, targetRequest._id, 'assigned', actor, { volunteerId: assignedVolunteer._id }),
    /already handling another active request/
  );

  await rejectAssignment(db, otherRequest._id, assignedVolunteer._id, { id: assignedVolunteer.user_id, role: 'volunteer' });
  assert.equal(otherRequest.status, 'pending_assignment');
  assert.equal(otherRequest.current_assigned_volunteer_id, null);
  assert.equal(db.history.at(-1).action, 'REQUEST_REJECTED');

  await transitionRequest(db, targetRequest._id, 'assigned', actor, { volunteerId: assignedVolunteer._id });
  await transitionRequest(db, targetRequest._id, 'accepted', { id: assignedVolunteer.user_id, role: 'volunteer' });
  assert.equal(targetRequest.status, 'accepted');
});

test('does not allow an assigned request to move directly to completed', async () => {
  const assignedVolunteer = volunteer('00000000000000000000000b');
  const targetRequest = request('00000000000000000000000c', { status: 'assigned', current_assigned_volunteer_id: assignedVolunteer._id });
  const db = fakeDatabase({ requests: [targetRequest], assignments: [{ request_id: targetRequest._id, volunteer_id: assignedVolunteer._id, status: 'active', expired_at: null }] });

  await assert.rejects(transitionRequest(db, targetRequest._id, 'completed', { id: assignedVolunteer.user_id, role: 'volunteer' }), /Invalid request state transition/);
});