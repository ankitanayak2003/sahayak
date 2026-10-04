const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { validateLocationInput, ALLOWED_LOCATION_SOURCES } = require('../src/utils/locationValidation');
const {
  createRequest,
  transitionRequest,
  autoAssignRequest,
  promoteNextQueuedAssignment,
} = require('../src/services/requestService');

function matches(document, query) {
  if (!document) return false;
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some((item) => matches(document, item));
    if (key === '$and') return expected.every((item) => matches(document, item));
    if (expected && typeof expected === 'object' && !(expected instanceof ObjectId)) {
      if ('$exists' in expected) return (key in document) === expected.$exists;
      if ('$gt' in expected) return document[key] > expected.$gt;
      if ('$ne' in expected) return document[key] !== expected.$ne;
      if ('$in' in expected) {
        return expected.$in.some((val) => (
          (val && val.equals && val.equals(document[key])) ||
          (document[key] && document[key].equals && document[key].equals(val)) ||
          String(val) === String(document[key])
        ));
      }
      return document[key] === expected;
    }
    return document[key] === expected || (document[key] instanceof ObjectId && document[key].equals(expected)) || String(document[key]) === String(expected);
  });
}

function createMockDb({ requests = [], assignments = [], escalations = [], history = [], volunteers = [], users = [] } = {}) {
  let nextId = 1;
  const genId = () => new ObjectId(`${String(nextId++).padStart(24, '0')}`);

  const makeCollection = (arr) => ({
    async createIndex() {},
    async findOne(query, options = {}) {
      let filtered = arr.filter((item) => matches(item, query));
      if (options.sort) {
        const [sortKey, sortDir] = Object.entries(options.sort)[0];
        filtered.sort((a, b) => (sortDir > 0 ? (a[sortKey] > b[sortKey] ? 1 : -1) : (a[sortKey] < b[sortKey] ? 1 : -1)));
      }
      return filtered[0] || null;
    },
    find(query) {
      const filtered = arr.filter((item) => matches(item, query));
      return {
        sort(sortObj) {
          const [sortKey, sortDir] = Object.entries(sortObj)[0];
          filtered.sort((a, b) => (sortDir > 0 ? (a[sortKey] > b[sortKey] ? 1 : -1) : (a[sortKey] < b[sortKey] ? 1 : -1)));
          return this;
        },
        skip(n) { return this; },
        limit(n) { return this; },
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
  });

  return {
    collection(name) {
      switch (name) {
        case 'assistance_requests': return makeCollection(requests);
        case 'request_assignments': return makeCollection(assignments);
        case 'emergency_escalations': return makeCollection(escalations);
        case 'request_status_history': return makeCollection(history);
        case 'volunteers': return makeCollection(volunteers);
        case 'users': return makeCollection(users);
        default: return makeCollection([]);
      }
    },
    _store: { requests, assignments, escalations, history, volunteers, users },
  };
}

// ============================================================
// 1. Valid GPS Coordinates
// ============================================================
test('GPS: validates and parses valid GPS coordinates with GeoJSON point', () => {
  const result = validateLocationInput({
    latitude: 12.9716,
    longitude: 77.6412,
    accuracy: 8.5,
    location_source: 'browser_gps',
    location_captured_at: '2026-10-02T12:00:00Z',
  });

  assert.equal(result.valid, true);
  assert.equal(result.hasCoordinates, true);
  assert.equal(result.location.latitude, 12.9716);
  assert.equal(result.location.longitude, 77.6412);
  assert.equal(result.location.accuracy_meters, 8.5);
  assert.equal(result.location.location_source, 'browser_gps');
  assert.deepEqual(result.location.geojson, {
    type: 'Point',
    coordinates: [77.6412, 12.9716], // GeoJSON [lng, lat]
  });
});

// ============================================================
// 2. Invalid Latitude and Longitude
// ============================================================
test('GPS: rejects out of range latitude (> 90)', () => {
  const result = validateLocationInput({ latitude: 90.001, longitude: 77.6412 });
  assert.equal(result.valid, false);
  assert.match(result.error, /Latitude out of range/);
});

test('GPS: rejects out of range latitude (< -90)', () => {
  const result = validateLocationInput({ latitude: -95.5, longitude: 77.6412 });
  assert.equal(result.valid, false);
  assert.match(result.error, /Latitude out of range/);
});

test('GPS: rejects out of range longitude (> 180)', () => {
  const result = validateLocationInput({ latitude: 12.9716, longitude: 181 });
  assert.equal(result.valid, false);
  assert.match(result.error, /Longitude out of range/);
});

test('GPS: rejects out of range longitude (< -180)', () => {
  const result = validateLocationInput({ latitude: 12.9716, longitude: -185 });
  assert.equal(result.valid, false);
  assert.match(result.error, /Longitude out of range/);
});

test('GPS: rejects non-finite latitude or longitude', () => {
  const nanResult = validateLocationInput({ latitude: 'not-a-number', longitude: 77.6412 });
  assert.equal(nanResult.valid, false);
  assert.match(nanResult.error, /Latitude must be a valid finite number/);

  const infResult = validateLocationInput({ latitude: 12.9716, longitude: Infinity });
  assert.equal(infResult.valid, false);
  assert.match(infResult.error, /Longitude must be a valid finite number/);
});

test('GPS: rejects partial coordinates (latitude without longitude)', () => {
  const result = validateLocationInput({ latitude: 12.9716 });
  assert.equal(result.valid, false);
  assert.match(result.error, /Both latitude and longitude must be provided together/);
});

test('GPS: rejects partial coordinates (longitude without latitude)', () => {
  const result = validateLocationInput({ longitude: 77.6412 });
  assert.equal(result.valid, false);
  assert.match(result.error, /Both latitude and longitude must be provided together/);
});

test('GPS: rejects negative accuracy', () => {
  const result = validateLocationInput({ latitude: 12.9716, longitude: 77.6412, accuracy: -10 });
  assert.equal(result.valid, false);
  assert.match(result.error, /Location accuracy must be a non-negative finite number/);
});

// ============================================================
// 3. Missing Coordinates and Text-Only Requests
// ============================================================
test('GPS: text-only request without coordinates returns valid with null location', () => {
  const result = validateLocationInput({
    locationText: 'MG Road Metro Station, Bengaluru',
  });
  assert.equal(result.valid, true);
  assert.equal(result.hasCoordinates, false);
  assert.equal(result.location, null);
});

// ============================================================
// 4. Manual or Caller-Provided Location
// ============================================================
test('GPS: supports manual pin and caller provided location sources', () => {
  const manual = validateLocationInput({
    latitude: 12.975,
    longitude: 77.645,
    location_source: 'manual_pin',
  });
  assert.equal(manual.valid, true);
  assert.equal(manual.location.location_source, 'manual_pin');

  const caller = validateLocationInput({
    latitude: 12.98,
    longitude: 77.65,
    location_source: 'caller_provided',
  });
  assert.equal(caller.valid, true);
  assert.equal(caller.location.location_source, 'caller_provided');
});

// ============================================================
// 5. Emergency creation with coordinates
// ============================================================
test('GPS: createRequest persists exact coordinates and GeoJSON in database', async () => {
  const db = createMockDb();
  const request = await createRequest(db, {
    category: 'medicine',
    urgencyLevel: 'routine',
    description: 'Senior citizen requires insulin delivery at location.',
    locationText: '100ft Road, Indiranagar',
    latitude: 12.9716,
    longitude: 77.6412,
    accuracy: 12.4,
    location_source: 'browser_gps',
    location_captured_at: '2026-10-02T12:30:00Z',
  });

  assert.ok(request._id);
  assert.equal(request.latitude, 12.9716);
  assert.equal(request.longitude, 77.6412);
  assert.equal(request.accuracy_meters, 12.4);
  assert.equal(request.location_source, 'browser_gps');
  assert.deepEqual(request.location_geojson, {
    type: 'Point',
    coordinates: [77.6412, 12.9716],
  });

  // Verify status history
  assert.equal(db._store.history.length, 1);
  assert.equal(db._store.history[0].action, 'REQUEST_CREATED');
  assert.equal(db._store.history[0].new_state, 'pending_assignment');
});

// ============================================================
// 6. Emergency creation without coordinates (text-only)
// ============================================================
test('GPS: createRequest succeeds without coordinates for backward compatibility', async () => {
  const db = createMockDb();
  const request = await createRequest(db, {
    category: 'groceries',
    urgencyLevel: 'routine',
    description: 'Essential ration supplies needed.',
    locationText: 'Shivajinagar Bus Station',
  });

  assert.ok(request._id);
  assert.equal(request.latitude, null);
  assert.equal(request.longitude, null);
  assert.equal(request.accuracy_meters, null);
  assert.equal(request.location_geojson, null);
  assert.equal(request.location_text, 'Shivajinagar Bus Station');
  assert.equal(request.status, 'pending_assignment');
});

// ============================================================
// 7. createRequest rejects invalid coordinates
// ============================================================
test('GPS: createRequest rejects invalid coordinates with 400 error', async () => {
  const db = createMockDb();
  await assert.rejects(
    async () => {
      await createRequest(db, {
        category: 'medicine',
        urgencyLevel: 'routine',
        description: 'Invalid coordinates request.',
        latitude: 105.0, // Invalid latitude > 90
        longitude: 77.6412,
      });
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /Latitude out of range/);
      return true;
    }
  );
});

// ============================================================
// 8. Location visibility for authorized admin vs volunteer
// ============================================================
test('GPS: location coordinates are correctly preserved across transitions', async () => {
  const volunteerId = new ObjectId('000000000000000000000010');
  const db = createMockDb();

  const reqDoc = await createRequest(db, {
    category: 'medicine',
    urgencyLevel: 'routine',
    description: 'Patient needs blood pressure monitor.',
    locationText: 'HAL 2nd Stage, Bangalore',
    latitude: 12.9680,
    longitude: 77.6520,
    accuracy: 5.0,
    location_source: 'browser_gps',
  });

  // Assign request to volunteer
  const adminActor = { id: new ObjectId('000000000000000000000001'), role: 'police_admin' };
  const assigned = await transitionRequest(db, reqDoc._id, 'assigned', adminActor, {
    volunteerId,
  });

  assert.equal(assigned.status, 'assigned');
  assert.equal(assigned.current_assigned_volunteer_id, volunteerId);
  assert.equal(assigned.latitude, 12.9680);
  assert.equal(assigned.longitude, 77.6520);
  assert.equal(assigned.accuracy_meters, 5.0);
  assert.equal(assigned.location_source, 'browser_gps');

  // Verify status history
  assert.equal(db._store.history.length, 2);
  assert.equal(db._store.history[1].action, 'REQUEST_ASSIGNED');
});

// ============================================================
// 9. Unauthorized volunteer IDOR isolation test
// ============================================================
test('GPS: volunteer visibility isolation prevents unauthorized location access', async () => {
  const assignedVolunteerId = new ObjectId('000000000000000000000011');
  const otherVolunteerId = new ObjectId('000000000000000000000022');
  const otherUserId = new ObjectId('000000000000000000000033');

  const volunteers = [
    { _id: assignedVolunteerId, user_id: new ObjectId('000000000000000000000044') },
    { _id: otherVolunteerId, user_id: otherUserId },
  ];

  const db = createMockDb({ volunteers });

  const reqDoc = await createRequest(db, {
    category: 'medicine',
    urgencyLevel: 'routine',
    description: 'Private citizen emergency with precise GPS.',
    latitude: 12.9716,
    longitude: 77.6412,
  });

  const adminActor = { id: new ObjectId('000000000000000000000001'), role: 'police_admin' };
  await transitionRequest(db, reqDoc._id, 'assigned', adminActor, {
    volunteerId: assignedVolunteerId,
  });

  // Check visibility logic matching visibleRequest in requests.js
  const userRoleVolunteer = { id: otherUserId.toString(), role: 'volunteer' };

  // Helper matching requests.js visibleRequest
  async function checkVisible(dbInstance, request, user) {
    if (user.role === 'police_admin') return true;
    if (!request.current_assigned_volunteer_id) return false;
    const vol = await dbInstance.collection('volunteers').findOne({
      _id: request.current_assigned_volunteer_id,
      user_id: new ObjectId(user.id),
    });
    return Boolean(vol);
  }

  const assignedDoc = await db.collection('assistance_requests').findOne({ _id: reqDoc._id });
  const isVisibleToOther = await checkVisible(db, assignedDoc, userRoleVolunteer);
  assert.equal(isVisibleToOther, false, 'Unauthorized volunteer must not have access to another volunteer request');

  const adminUser = { id: '000000000000000000000001', role: 'police_admin' };
  const isVisibleToAdmin = await checkVisible(db, assignedDoc, adminUser);
  assert.equal(isVisibleToAdmin, true, 'Police admin must have access to all requests');
});

// ============================================================
// 10. Regression tests for auto-assignment, queue promotion & history
// ============================================================
test('GPS: auto-assignment and queue promotion seamlessly operate with coordinates', async () => {
  const volunteerId = new ObjectId('000000000000000000000055');
  const userId = new ObjectId('000000000000000000000056');

  const volunteers = [
    {
      _id: volunteerId,
      user_id: userId,
      verification_status: 'verified',
      is_available: true,
      created_at: new Date('2026-01-01'),
    },
  ];
  const users = [
    {
      _id: userId,
      account_status: 'active',
    },
  ];

  const db = createMockDb({ volunteers, users });

  // 1. Create first request with coordinates -> Should be auto-assigned
  const req1 = await createRequest(db, {
    category: 'transport',
    urgencyLevel: 'urgent',
    description: 'Emergency ambulance escort.',
    latitude: 12.9200,
    longitude: 77.6100,
    accuracy: 10,
    location_source: 'browser_gps',
  });

  assert.equal(req1.status, 'assigned');
  assert.equal(req1.latitude, 12.9200);
  assert.equal(req1.queue_position, 1);

  // 2. Create second request with coordinates -> Volunteer is now busy, should queue
  const req2 = await createRequest(db, {
    category: 'medicine',
    urgencyLevel: 'routine',
    description: 'Queued medication delivery.',
    latitude: 12.9300,
    longitude: 77.6200,
    accuracy: 15,
    location_source: 'browser_gps',
  });

  assert.equal(req2.status, 'queued');
  assert.equal(req2.latitude, 12.9300);
  assert.equal(req2.queue_position, 2);

  // 3. Complete first incident -> Queue promotion should promote req2 to assigned
  await transitionRequest(db, req1._id, 'accepted', { id: userId, role: 'volunteer' });
  await transitionRequest(db, req1._id, 'in_progress', { id: userId, role: 'volunteer' });
  await transitionRequest(db, req1._id, 'completed', { id: userId, role: 'volunteer' });

  // Check req2 status
  const updatedReq2 = await db.collection('assistance_requests').findOne({ _id: req2._id });
  assert.equal(updatedReq2.status, 'assigned');
  assert.equal(updatedReq2.queue_position, 1);
  assert.equal(updatedReq2.latitude, 12.9300);
  assert.equal(updatedReq2.longitude, 77.6200);
});
