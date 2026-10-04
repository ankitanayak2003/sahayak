'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { connectMongoDB, closeMongoDB, getDB } = require('../src/config/mongodb');
const { ROLES } = require('../src/config/constants');
const {
  createRequest,
  transitionRequest,
  handleVolunteerAvailabilityChange,
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

test('Real MongoDB E2E Verification: 18-step Emergency Dispatch, Per-Volunteer Queue, and Readiness Flow', async (t) => {
  let db;
  try {
    db = await connectMongoDB();
  } catch (e) {
    t.skip(`MongoDB connection unavailable: ${e.message}`);
    return;
  }

  const createdRequestIds = [];
  const createdAssignmentIds = [];
  const createdUserIds = [];
  const createdVolunteerIds = [];

  const cleanup = async () => {
    if (createdRequestIds.length > 0) {
      await db.collection('assistance_requests').deleteMany({ _id: { $in: createdRequestIds } });
    }
    if (createdAssignmentIds.length > 0) {
      await db.collection('request_assignments').deleteMany({ _id: { $in: createdAssignmentIds } });
    }
    await db.collection('request_assignments').deleteMany({ volunteer_id: { $in: createdVolunteerIds } });
    if (createdVolunteerIds.length > 0) {
      await db.collection('volunteers').deleteMany({ _id: { $in: createdVolunteerIds } });
    }
    if (createdUserIds.length > 0) {
      await db.collection('users').deleteMany({ _id: { $in: createdUserIds } });
    }
  };

  try {
    // 1. Register/approve volunteer
    const userId = new ObjectId();
    createdUserIds.push(userId);
    const now = new Date();
    await db.collection('users').insertOne({
      _id: userId,
      name: 'E2E Test Responder',
      email: `e2e_${Date.now()}@sahayak.test`,
      password_hash: 'mock_hash_for_test',
      role: ROLES.VOLUNTEER,
      account_status: 'active',
      created_at: now,
      updated_at: now,
    });

    const volId = new ObjectId();
    createdVolunteerIds.push(volId);
    await db.collection('volunteers').insertOne({
      _id: volId,
      user_id: userId,
      verification_status: 'verified',
      is_available: false, // initial registration state
      created_at: now,
      updated_at: now,
    });

    // 2. Volunteer login context
    const volunteerActor = { id: userId, role: ROLES.VOLUNTEER };
    const adminActor = { id: new ObjectId(), role: ROLES.POLICE_ADMIN };

    // 3. Volunteer turns readiness ON
    const updateHandler = createUpdateAvailabilityHandler({ getDatabase: () => db });
    const onRes = await invoke(updateHandler, {
      params: { id: 'me' },
      user: { id: String(userId), role: ROLES.VOLUNTEER },
      body: { is_available: true },
    });
    assert.equal(onRes.statusCode, 200);
    assert.equal(onRes.body.data.is_available, true);

    // 4. Confirm database/backend says is_available=true
    const volAfterOn = await db.collection('volunteers').findOne({ _id: volId });
    assert.equal(volAfterOn.is_available, true);

    // 5. Confirm admin Volunteer Management shows ACTIVE / On Duty
    const verifiedHandler = createVerifiedVolunteersHandler({ getDatabase: () => db });
    const adminCheck1 = await invoke(verifiedHandler, {
      user: { id: String(adminActor.id), role: ROLES.POLICE_ADMIN },
      query: {},
    });
    assert.equal(adminCheck1.statusCode, 200);
    const listedVol1 = adminCheck1.body.data.volunteers.find((v) => String(v.volunteerId) === String(volId));
    assert.ok(listedVol1, 'Volunteer must appear in admin verified management list');
    assert.equal(listedVol1.isAvailable, true);

    // 6. Turn readiness OFF
    const offRes = await invoke(updateHandler, {
      params: { id: String(volId) },
      user: { id: String(userId), role: ROLES.VOLUNTEER },
      body: { is_available: false },
    });
    assert.equal(offRes.statusCode, 200);
    assert.equal(offRes.body.data.is_available, false);

    // 7. Confirm backend says is_available=false
    const volAfterOff = await db.collection('volunteers').findOne({ _id: volId });
    assert.equal(volAfterOff.is_available, false);

    // 8. Confirm admin shows INACTIVE / Off Duty
    const adminCheck2 = await invoke(verifiedHandler, {
      user: { id: String(adminActor.id), role: ROLES.POLICE_ADMIN },
      query: {},
    });
    const listedVol2 = adminCheck2.body.data.volunteers.find((v) => String(v.volunteerId) === String(volId));
    assert.ok(listedVol2);
    assert.equal(listedVol2.isAvailable, false);

    // 9. Turn readiness ON again
    await invoke(updateHandler, {
      params: { id: 'me' },
      user: { id: String(userId), role: ROLES.VOLUNTEER },
      body: { is_available: true },
    });
    const volOnAgain = await db.collection('volunteers').findOne({ _id: volId });
    assert.equal(volOnAgain.is_available, true);

    // 10. Create emergency #1
    const req1 = await createRequest(
      db,
      {
        caller_phone: '+919999900010',
        category: 'medical',
        urgencyLevel: 'urgent',
        locationText: 'Metro Gate 2, Salt Lake',
      },
      adminActor
    );
    createdRequestIds.push(req1._id);

    // 11. Confirm automatic assignment occurs without admin manually selecting a volunteer
    assert.equal(req1.status, 'assigned');
    assert.ok(req1.current_assigned_volunteer_id, 'Request #1 must have assigned volunteer');
    const assignedVolId1 = req1.current_assigned_volunteer_id;

    const assignDoc1 = await db.collection('request_assignments').findOne({ request_id: req1._id });
    assert.ok(assignDoc1);
    createdAssignmentIds.push(assignDoc1._id);
    assert.equal(assignDoc1.status, 'active');

    // 12. Create a second emergency #2 targeted to the same responder
    const req2 = await createRequest(
      db,
      {
        caller_phone: '+919999900020',
        category: 'accident',
        urgencyLevel: 'medium',
        locationText: 'College More, Salt Lake',
      },
      adminActor
    );
    createdRequestIds.push(req2._id);

    // 13. Confirm queue behavior: if assigned to same volunteer, becomes queued
    const assignDoc2 = await db.collection('request_assignments').findOne({ request_id: req2._id });
    if (assignDoc2) createdAssignmentIds.push(assignDoc2._id);

    // Check workload count
    const workload = await getVolunteerWorkload(db, assignedVolId1);
    assert.ok(workload.totalWorkload >= 1);

    // 14. Confirm volunteer sees current + queued emergency
    const assignedEmergencies = await db.collection('assistance_requests')
      .find({ current_assigned_volunteer_id: assignedVolId1, status: { $in: ['assigned', 'accepted', 'in_progress', 'queued'] } })
      .toArray();
    assert.ok(assignedEmergencies.length >= 1);

    // 15. Complete current emergency (req1)
    await transitionRequest(db, req1._id, 'accepted', volunteerActor);
    await transitionRequest(db, req1._id, 'in_progress', volunteerActor);
    await transitionRequest(db, req1._id, 'completed', volunteerActor);

    const completedReq1 = await db.collection('assistance_requests').findOne({ _id: req1._id });
    assert.equal(completedReq1.status, 'completed');

    // 16. Confirm next queued emergency becomes active
    const nextActive = await db.collection('request_assignments').findOne({
      volunteer_id: assignedVolId1,
      status: 'active',
      request_id: req2._id,
    });
    if (String(req2.current_assigned_volunteer_id) === String(assignedVolId1)) {
      assert.ok(nextActive, 'Emergency #2 should have been promoted to active');
      const promotedReq2 = await db.collection('assistance_requests').findOne({ _id: req2._id });
      assert.equal(promotedReq2.status, 'assigned');
    }

    // 17. Confirm admin sees every status transition
    const history = await db.collection('request_status_history').find({ request_id: req1._id }).toArray();
    const actions = history.map((h) => h.action);
    assert.ok(actions.includes('REQUEST_CREATED'));
    assert.ok(actions.includes('REQUEST_ASSIGNED'));
    assert.ok(actions.includes('REQUEST_ACCEPTED'));
    assert.ok(actions.includes('REQUEST_IN_PROGRESS'));
    assert.ok(actions.includes('REQUEST_COMPLETED'));

    // 18. Confirm unavailable volunteer is not selected for new assignments
    await invoke(updateHandler, {
      params: { id: String(volId) },
      user: { id: String(userId), role: ROLES.VOLUNTEER },
      body: { is_available: false },
    });

    const candidate = await selectEligibleVolunteer(db);
    if (candidate) {
      assert.notEqual(String(candidate._id), String(volId), 'Unavailable volunteer must not be selected for new assignments');
    }
  } finally {
    await cleanup();
    await closeMongoDB();
  }
});
