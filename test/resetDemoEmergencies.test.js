'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const {
  resetDemoEmergencies,
  buildFilters,
  executeDeletions,
  TARGET_COLLECTIONS,
  PRESERVED_COLLECTIONS,
} = require('../scripts/reset-demo-emergencies');

function createMockCollection(name, data, executionLog = []) {
  return {
    collectionName: name,
    find(query, options) {
      return {
        toArray: async () => data,
      };
    },
    countDocuments: async (query = {}) => data.length,
    deleteMany: async (query = {}) => {
      executionLog.push({ collection: name, query, count: data.length });
      const deletedCount = data.length;
      data.length = 0;
      return { deletedCount };
    },
  };
}

function createMockDb(initialState = {}, executionLog = []) {
  const store = {
    request_status_history: [...(initialState.request_status_history || [])],
    emergency_escalations: [...(initialState.emergency_escalations || [])],
    request_assignments: [...(initialState.request_assignments || [])],
    call_logs: [...(initialState.call_logs || [])],
    notifications: [...(initialState.notifications || [])],
    assistance_requests: [...(initialState.assistance_requests || [])],
    users: [...(initialState.users || [])],
    volunteers: [...(initialState.volunteers || [])],
    volunteer_verifications: [...(initialState.volunteer_verifications || [])],
    refresh_tokens: [...(initialState.refresh_tokens || [])],
  };

  return {
    store,
    collection(name) {
      if (!store[name]) {
        store[name] = [];
      }
      return createMockCollection(name, store[name], executionLog);
    },
  };
}

test('RESET SCRIPT: rejects invalid confirmation and aborts without deleting data', async () => {
  const executionLog = [];
  const reqId = new ObjectId('000000000000000000000001');
  const mockDb = createMockDb(
    {
      assistance_requests: [{ _id: reqId, status: 'escalated_to_112' }],
      emergency_escalations: [{ _id: new ObjectId(), request_id: reqId }],
      users: [{ _id: new ObjectId(), email: 'admin@sahayak.test' }],
    },
    executionLog
  );

  const result = await resetDemoEmergencies({
    db: mockDb,
    confirmation: 'wrong_confirmation',
  });

  assert.equal(result.success, false);
  assert.equal(result.reason, 'confirmation_required');
  assert.equal(executionLog.length, 0, 'No delete operations should have run');
  assert.equal(mockDb.store.assistance_requests.length, 1);
  assert.equal(mockDb.store.emergency_escalations.length, 1);
  assert.equal(mockDb.store.users.length, 1);
});

test('RESET SCRIPT: deletes records in strict child-before-parent order with RESET_DEMO confirmation', async () => {
  const executionLog = [];
  const reqId = new ObjectId('000000000000000000000001');
  const adminId = new ObjectId('000000000000000000000002');
  const volUserId = new ObjectId('000000000000000000000003');
  const volId = new ObjectId('000000000000000000000004');

  const mockDb = createMockDb(
    {
      request_status_history: [{ _id: new ObjectId(), request_id: reqId }],
      emergency_escalations: [{ _id: new ObjectId(), request_id: reqId, escalated_to: '112' }],
      request_assignments: [{ _id: new ObjectId(), request_id: reqId, volunteer_id: volId }],
      call_logs: [{ _id: new ObjectId(), request_id: reqId, source: 'voice_webhook' }],
      notifications: [{ _id: new ObjectId(), message: 'A request has been assigned to you.' }],
      assistance_requests: [{ _id: reqId, status: 'escalated_to_112', is_emergency: true }],
      // Preserved data:
      users: [
        { _id: adminId, email: 'admin@sahayak.test', role: 'police_admin' },
        { _id: volUserId, email: 'vol@sahayak.test', role: 'volunteer' },
      ],
      volunteers: [{ _id: volId, user_id: volUserId, verification_status: 'verified', is_available: true }],
      volunteer_verifications: [{ _id: new ObjectId(), volunteer_id: volId, status: 'verified' }],
      refresh_tokens: [{ _id: new ObjectId(), user_id: adminId, token_hash: 'abc' }],
    },
    executionLog
  );

  const result = await resetDemoEmergencies({
    db: mockDb,
    confirmation: 'RESET_DEMO',
  });

  assert.equal(result.success, true);
  assert.ok(result.deletedCounts);

  // Check that all 6 target collections were emptied
  assert.equal(mockDb.store.request_status_history.length, 0);
  assert.equal(mockDb.store.emergency_escalations.length, 0);
  assert.equal(mockDb.store.request_assignments.length, 0);
  assert.equal(mockDb.store.call_logs.length, 0);
  assert.equal(mockDb.store.notifications.length, 0);
  assert.equal(mockDb.store.assistance_requests.length, 0);

  // Verify preserved collections were NOT touched
  assert.equal(mockDb.store.users.length, 2, 'Users must be preserved');
  assert.equal(mockDb.store.volunteers.length, 1, 'Volunteer profiles must be preserved');
  assert.equal(mockDb.store.volunteer_verifications.length, 1, 'Verifications must be preserved');
  assert.equal(mockDb.store.refresh_tokens.length, 1, 'Refresh tokens must be preserved');

  // Verify deletion order: children BEFORE parent assistance_requests
  const collectionOrder = executionLog.map((entry) => entry.collection);
  assert.deepEqual(collectionOrder, [
    'request_status_history',
    'emergency_escalations',
    'request_assignments',
    'call_logs',
    'notifications',
    'assistance_requests',
  ]);
});

test('RESET SCRIPT: runs safely when zero emergency records exist', async () => {
  const executionLog = [];
  const adminId = new ObjectId('000000000000000000000002');
  const mockDb = createMockDb(
    {
      request_status_history: [],
      emergency_escalations: [],
      request_assignments: [],
      call_logs: [],
      notifications: [],
      assistance_requests: [],
      users: [{ _id: adminId, role: 'police_admin' }],
      volunteers: [{ _id: new ObjectId(), user_id: adminId }],
      volunteer_verifications: [],
      refresh_tokens: [],
    },
    executionLog
  );

  const result = await resetDemoEmergencies({
    db: mockDb,
    confirmation: 'RESET_DEMO',
  });

  assert.equal(result.success, true);
  assert.equal(executionLog.length, 0, 'No delete operations should execute when already empty');
  assert.equal(mockDb.store.users.length, 1, 'Users remain preserved');
});

test('RESET SCRIPT: buildFilters constructs valid filters for all target collections', async () => {
  const reqId = new ObjectId();
  const mockDb = createMockDb({
    assistance_requests: [{ _id: reqId }],
  });

  const { requestIds, filters } = await buildFilters(mockDb);
  assert.equal(requestIds.length, 1);
  assert.deepEqual(requestIds[0], reqId);
  assert.ok(filters.request_status_history);
  assert.ok(filters.emergency_escalations);
  assert.ok(filters.request_assignments);
  assert.ok(filters.call_logs);
  assert.ok(filters.notifications);
  assert.ok(filters.assistance_requests);
});
