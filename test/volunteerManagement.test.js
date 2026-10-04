'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { ROLES } = require('../src/config/constants');
const {
  createVerifiedVolunteersHandler,
  createAvailableVolunteersHandler,
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
      return document[key] === expected;
    }
    return (
      document[key] === expected ||
      (document[key] instanceof ObjectId && document[key].equals(expected)) ||
      String(document[key]) === String(expected)
    );
  });
}

function createMockDb({ volunteers = [], users = [], assignments = [], requests = [] } = {}) {
  const makeCollection = (arr) => ({
    async createIndex() {},
    async findOne(query) {
      return arr.find((item) => matches(item, query)) || null;
    },
    find(query, options = {}) {
      const filtered = arr.filter((item) => matches(item, query));
      let result = [...filtered];
      return {
        sort() {
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
    async countDocuments(query) {
      return arr.filter((item) => matches(item, query)).length;
    },
  });

  return {
    collection(name) {
      if (name === 'volunteers') return makeCollection(volunteers);
      if (name === 'users') return makeCollection(users);
      if (name === 'request_assignments') return makeCollection(assignments);
      if (name === 'assistance_requests') return makeCollection(requests);
      throw new Error(`Unexpected collection: ${name}`);
    },
  };
}

test('VOLUNTEER MANAGEMENT: verified + available volunteer appears in verified management list', async () => {
  const userId = new ObjectId('000000000000000000000001');
  const volId = new ObjectId('000000000000000000000002');

  const mockDb = createMockDb({
    volunteers: [
      {
        _id: volId,
        user_id: userId,
        verification_status: 'verified',
        is_available: true,
      },
    ],
    users: [
      {
        _id: userId,
        name: 'Active Verified Volunteer',
        email: 'active@sahayak.test',
        role: ROLES.VOLUNTEER,
      },
    ],
  });

  const handler = createVerifiedVolunteersHandler({ getDatabase: () => mockDb });
  const req = {
    user: { id: 'admin1', role: ROLES.POLICE_ADMIN },
    query: { page: '1', limit: '10' },
  };

  const res = await invoke(handler, req);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.volunteers.length, 1);
  assert.equal(String(res.body.data.volunteers[0].volunteerId), String(volId));
  assert.equal(res.body.data.volunteers[0].name, 'Active Verified Volunteer');
  assert.equal(res.body.data.volunteers[0].verificationStatus, 'verified');
  assert.equal(res.body.data.volunteers[0].isAvailable, true);
});

test('VOLUNTEER MANAGEMENT: verified + unavailable volunteer appears in verified management list', async () => {
  const userId = new ObjectId('000000000000000000000003');
  const volId = new ObjectId('000000000000000000000004');

  const mockDb = createMockDb({
    volunteers: [
      {
        _id: volId,
        user_id: userId,
        verification_status: 'verified',
        is_available: false, // newly approved or off-duty volunteer
      },
    ],
    users: [
      {
        _id: userId,
        name: 'Newly Approved Volunteer',
        email: 'newlyapproved@sahayak.test',
        role: ROLES.VOLUNTEER,
      },
    ],
  });

  const handler = createVerifiedVolunteersHandler({ getDatabase: () => mockDb });
  const req = {
    user: { id: 'admin1', role: ROLES.POLICE_ADMIN },
    query: { page: '1', limit: '10' },
  };

  const res = await invoke(handler, req);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.volunteers.length, 1);
  assert.equal(String(res.body.data.volunteers[0].volunteerId), String(volId));
  assert.equal(res.body.data.volunteers[0].name, 'Newly Approved Volunteer');
  assert.equal(res.body.data.volunteers[0].verificationStatus, 'verified');
  assert.equal(res.body.data.volunteers[0].isAvailable, false);
});

test('VOLUNTEER MANAGEMENT: pending volunteer does not appear in verified management list', async () => {
  const verifiedUserId = new ObjectId('000000000000000000000005');
  const verifiedVolId = new ObjectId('000000000000000000000006');
  const pendingUserId = new ObjectId('000000000000000000000007');
  const pendingVolId = new ObjectId('000000000000000000000008');

  const mockDb = createMockDb({
    volunteers: [
      {
        _id: verifiedVolId,
        user_id: verifiedUserId,
        verification_status: 'verified',
        is_available: false,
      },
      {
        _id: pendingVolId,
        user_id: pendingUserId,
        verification_status: 'pending',
        is_available: false,
      },
    ],
    users: [
      { _id: verifiedUserId, name: 'Verified Volunteer', email: 'verified@sahayak.test' },
      { _id: pendingUserId, name: 'Pending Volunteer', email: 'pending@sahayak.test' },
    ],
  });

  const handler = createVerifiedVolunteersHandler({ getDatabase: () => mockDb });
  const req = {
    user: { id: 'admin1', role: ROLES.POLICE_ADMIN },
    query: { page: '1', limit: '10' },
  };

  const res = await invoke(handler, req);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.volunteers.length, 1);
  assert.equal(String(res.body.data.volunteers[0].volunteerId), String(verifiedVolId));
  assert.equal(
    res.body.data.volunteers.some((v) => String(v.volunteerId) === String(pendingVolId)),
    false,
    'Pending volunteer must not be returned in verified list'
  );
});

test('VOLUNTEER MANAGEMENT: /volunteers/available still returns only verified + available volunteers', async () => {
  const availUserId = new ObjectId('000000000000000000000010');
  const availVolId = new ObjectId('000000000000000000000011');
  const unavailUserId = new ObjectId('000000000000000000000012');
  const unavailVolId = new ObjectId('000000000000000000000013');
  const pendingUserId = new ObjectId('000000000000000000000014');
  const pendingVolId = new ObjectId('000000000000000000000015');

  const mockDb = createMockDb({
    volunteers: [
      {
        _id: availVolId,
        user_id: availUserId,
        verification_status: 'verified',
        is_available: true,
      },
      {
        _id: unavailVolId,
        user_id: unavailUserId,
        verification_status: 'verified',
        is_available: false,
      },
      {
        _id: pendingVolId,
        user_id: pendingUserId,
        verification_status: 'pending',
        is_available: false,
      },
    ],
    users: [
      { _id: availUserId, name: 'Available Volunteer' },
      { _id: unavailUserId, name: 'Unavailable Volunteer' },
      { _id: pendingUserId, name: 'Pending Volunteer' },
    ],
  });

  const availableHandler = createAvailableVolunteersHandler({ getDatabase: () => mockDb });
  const req = {
    user: { id: 'admin1', role: ROLES.POLICE_ADMIN },
    query: { page: '1', limit: '10' },
  };

  const res = await invoke(availableHandler, req);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.volunteers.length, 1);
  assert.equal(String(res.body.data.volunteers[0].volunteerId), String(availVolId));
  assert.equal(res.body.data.volunteers[0].isAvailable, true);
});
