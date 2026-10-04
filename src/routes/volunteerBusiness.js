const express = require('express');
const { ObjectId } = require('mongodb');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const { getDB } = require('../config/mongodb');
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/requireRole');
const { ROLES } = require('../config/constants');
const { handleVolunteerAvailabilityChange } = require('../services/requestService');

const router = express.Router();

function objectId(value) {
  return typeof value === 'string' && ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function parsePagination(query) {
  const page = query.page == null ? 1 : Number(query.page);
  const limit = query.limit == null ? 25 : Number(query.limit);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) return null;
  return { page, limit, skip: (page - 1) * limit };
}

function activeAssignmentFilter() {
  return {
    $or: [
      { status: 'active' },
      { status: 'queued' },
      { status: { $exists: false }, expired_at: null },
    ],
  };
}

function createAvailableVolunteersHandler({ getDatabase = getDB } = {}) {
  return asyncHandler(async (req, res) => {
    const pagination = parsePagination(req.query);
    if (!pagination) return error(res, 400, 'Invalid pagination. page must be >= 1 and limit must be between 1 and 100.');

    const db = getDatabase();
    const filter = { is_available: true, verification_status: 'verified' };
    const volunteers = await db.collection('volunteers').find(filter).sort({ _id: 1 }).skip(pagination.skip).limit(pagination.limit).toArray();
    const total = await db.collection('volunteers').countDocuments(filter);
    const userIds = volunteers.map(volunteer => volunteer.user_id);
    const users = await db.collection('users').find({ _id: { $in: userIds } }, { projection: { name: 1, email: 1 } }).toArray();
    const userMap = new Map(users.map(user => [String(user._id), user]));

    const assignments = await db.collection('request_assignments').find({
      volunteer_id: { $in: volunteers.map(volunteer => volunteer._id) },
      ...activeAssignmentFilter(),
    }).toArray();

    const activeAssignmentsByVolunteer = new Map();
    const workloadCountsByVolunteer = new Map();
    for (const a of assignments) {
      const vKey = String(a.volunteer_id);
      if (!workloadCountsByVolunteer.has(vKey)) {
        workloadCountsByVolunteer.set(vKey, { active: 0, queued: 0, total: 0 });
      }
      const c = workloadCountsByVolunteer.get(vKey);
      if (a.status === 'queued') {
        c.queued += 1;
      } else {
        c.active += 1;
        if (!activeAssignmentsByVolunteer.has(vKey)) {
          activeAssignmentsByVolunteer.set(vKey, a);
        }
      }
      c.total += 1;
    }

    const requestIds = assignments.map(assignment => assignment.request_id);
    const requests = await db.collection('assistance_requests').find({ _id: { $in: requestIds } }, { projection: { status: 1 } }).toArray();
    const statuses = new Map(requests.map(request => [String(request._id), request.status]));

    return success(res, 200, {
      volunteers: volunteers.map(volunteer => {
        const user = userMap.get(String(volunteer.user_id));
        const counts = workloadCountsByVolunteer.get(String(volunteer._id)) || { active: 0, queued: 0, total: 0 };
        const assignment = activeAssignmentsByVolunteer.get(String(volunteer._id));
        return {
          volunteerId: volunteer._id,
          userId: volunteer.user_id,
          name: user?.name || null,
          email: user?.email || null,
          verificationStatus: volunteer.verification_status,
          isAvailable: volunteer.is_available === true,
          isBusy: counts.active > 0,
          workloadCount: counts.total,
          activeCount: counts.active,
          queuedCount: counts.queued,
          currentAssignment: assignment ? { requestId: assignment.request_id, status: statuses.get(String(assignment.request_id)) || null } : null,
          createdAt: volunteer.created_at || user?.created_at || null,
        };
      }),
      pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) },
    });
  });
}

function createVerifiedVolunteersHandler({ getDatabase = getDB } = {}) {
  return asyncHandler(async (req, res) => {
    const pagination = parsePagination(req.query);
    if (!pagination) return error(res, 400, 'Invalid pagination. page must be >= 1 and limit must be between 1 and 100.');

    const db = getDatabase();
    const filter = { verification_status: 'verified' };
    const volunteers = await db.collection('volunteers').find(filter).sort({ _id: 1 }).skip(pagination.skip).limit(pagination.limit).toArray();
    const total = await db.collection('volunteers').countDocuments(filter);
    const userIds = volunteers.map(volunteer => volunteer.user_id);
    const users = await db.collection('users').find({ _id: { $in: userIds } }, { projection: { name: 1, email: 1, created_at: 1 } }).toArray();
    const userMap = new Map(users.map(user => [String(user._id), user]));

    const assignments = await db.collection('request_assignments').find({
      volunteer_id: { $in: volunteers.map(volunteer => volunteer._id) },
      ...activeAssignmentFilter(),
    }).toArray();

    const activeAssignmentsByVolunteer = new Map();
    const workloadCountsByVolunteer = new Map();
    for (const a of assignments) {
      const vKey = String(a.volunteer_id);
      if (!workloadCountsByVolunteer.has(vKey)) {
        workloadCountsByVolunteer.set(vKey, { active: 0, queued: 0, total: 0 });
      }
      const c = workloadCountsByVolunteer.get(vKey);
      if (a.status === 'queued') {
        c.queued += 1;
      } else {
        c.active += 1;
        if (!activeAssignmentsByVolunteer.has(vKey)) {
          activeAssignmentsByVolunteer.set(vKey, a);
        }
      }
      c.total += 1;
    }

    const requestIds = assignments.map(assignment => assignment.request_id);
    const requests = await db.collection('assistance_requests').find({ _id: { $in: requestIds } }, { projection: { status: 1 } }).toArray();
    const statuses = new Map(requests.map(request => [String(request._id), request.status]));

    return success(res, 200, {
      volunteers: volunteers.map(volunteer => {
        const user = userMap.get(String(volunteer.user_id));
        const counts = workloadCountsByVolunteer.get(String(volunteer._id)) || { active: 0, queued: 0, total: 0 };
        const assignment = activeAssignmentsByVolunteer.get(String(volunteer._id));
        return {
          volunteerId: volunteer._id,
          userId: volunteer.user_id,
          name: user?.name || null,
          email: user?.email || null,
          verificationStatus: volunteer.verification_status,
          isAvailable: volunteer.is_available === true,
          isBusy: counts.active > 0,
          workloadCount: counts.total,
          activeCount: counts.active,
          queuedCount: counts.queued,
          currentAssignment: assignment ? { requestId: assignment.request_id, status: statuses.get(String(assignment.request_id)) || null } : null,
          createdAt: volunteer.created_at || user?.created_at || null,
        };
      }),
      pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) },
    });
  });
}

router.get('/available', authenticate, requireRole(ROLES.POLICE_ADMIN), createAvailableVolunteersHandler());
router.get('/verified', authenticate, requireRole(ROLES.POLICE_ADMIN), createVerifiedVolunteersHandler());
router.get('/', authenticate, requireRole(ROLES.POLICE_ADMIN), createVerifiedVolunteersHandler());

router.get('/pending', authenticate, requireRole(ROLES.POLICE_ADMIN), asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  if (!pagination) return error(res, 400, 'Invalid pagination. page must be >= 1 and limit must be between 1 and 100.');

  const db = getDB();
  const filter = { verification_status: 'pending' };
  const volunteers = await db.collection('volunteers')
    .find(filter)
    .sort({ created_at: -1, _id: 1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .toArray();
  const total = await db.collection('volunteers').countDocuments(filter);

  const userIds = volunteers.map(volunteer => volunteer.user_id);
  const users = await db.collection('users').find(
    { _id: { $in: userIds } },
    { projection: { name: 1, email: 1, created_at: 1 } }
  ).toArray();
  const userMap = new Map(users.map(user => [String(user._id), user]));

  return success(res, 200, {
    volunteers: volunteers.map(volunteer => {
      const user = userMap.get(String(volunteer.user_id));
      return {
        volunteerId: volunteer._id,
        userId: volunteer.user_id,
        name: user?.name || null,
        email: user?.email || null,
        verificationStatus: volunteer.verification_status,
        isAvailable: volunteer.is_available === true,
        workloadCount: 0,
        activeCount: 0,
        queuedCount: 0,
        createdAt: volunteer.created_at || user?.created_at || null,
      };
    }),
    pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) },
  });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const db = getDB();
  const volunteer = await db.collection('volunteers').findOne({ user_id: new ObjectId(req.user.id) });
  if (!volunteer) return error(res, 404, 'Volunteer not found.');
  const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });
  return success(res, 200, {
    volunteer: {
      ...volunteer,
      name: user?.name || null,
      email: user?.email || null,
      is_available: volunteer.is_available === true,
      isAvailable: volunteer.is_available === true,
    },
  });
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const id = objectId(req.params.id);
  if (!id) return error(res, 400, 'Invalid volunteer ID.');

  const profile = await getDB().collection('volunteers').findOne({ _id: id });
  if (!profile) return error(res, 404, 'Volunteer not found.');

  if (req.user.role !== ROLES.POLICE_ADMIN && String(profile.user_id) !== req.user.id) {
    return error(res, 403, 'Forbidden.');
  }

  return success(res, 200, {
    volunteer: {
      ...profile,
      is_available: profile.is_available === true,
      isAvailable: profile.is_available === true,
    },
  });
}));

function createUpdateAvailabilityHandler(options = {}) {
  const getDatabase = options.getDatabase || getDB;
  return asyncHandler(async (req, res) => {
    let id = objectId(req.params.id);
    const db = getDatabase();
    if (!id && req.params.id === 'me') {
      const vol = await db.collection('volunteers').findOne({ user_id: new ObjectId(req.user.id) });
      id = vol?._id;
    }
    if (!id || typeof req.body?.is_available !== 'boolean') return error(res, 400, 'Invalid availability request.');

    const volunteers = db.collection('volunteers');
    const profile = await volunteers.findOne({ _id: id });
    if (!profile) return error(res, 404, 'Volunteer not found.');
    if (req.user.role !== ROLES.POLICE_ADMIN && String(profile.user_id) !== String(req.user.id)) return error(res, 403, 'Forbidden.');

    await volunteers.updateOne({ _id: id }, { $set: { is_available: req.body.is_available, updated_at: new Date() } });

    // Handle reassignment or dispatch side-effects
    await handleVolunteerAvailabilityChange(db, id, req.body.is_available, req.user);

    return success(res, 200, {
      message: 'Volunteer availability updated.',
      volunteerId: id,
      is_available: req.body.is_available,
      isAvailable: req.body.is_available,
    });
  });
}

router.patch('/:id/availability', authenticate, requireRole(ROLES.VOLUNTEER, ROLES.POLICE_ADMIN), createUpdateAvailabilityHandler());

router.patch('/:id/verification', authenticate, requireRole(ROLES.POLICE_ADMIN), asyncHandler(async (req, res) => {
  const id = objectId(req.params.id);
  const status = req.body?.verification_status;
  if (!id || !['pending', 'verified', 'rejected', 'suspended'].includes(status)) return error(res, 400, 'Invalid verification request.');

  const db = getDB();
  const volunteers = db.collection('volunteers');
  const profile = await volunteers.findOne({ _id: id });
  if (!profile) return error(res, 404, 'Volunteer not found.');

  const now = new Date();
  await volunteers.updateOne({ _id: id }, { $set: { verification_status: status, updated_at: now } });
  await db.collection('users').updateOne(
    { _id: profile.user_id, role: ROLES.VOLUNTEER },
    { $set: { account_status: status === 'verified' ? 'active' : 'suspended', updated_at: now } }
  );
  await db.collection('volunteer_verifications').insertOne({ volunteer_id: id, verified_by: new ObjectId(req.user.id), verification_status: status, created_at: now, updated_at: now });

  if (status === 'suspended' || status === 'rejected') {
    await handleVolunteerAvailabilityChange(db, id, false, req.user);
  }

  return success(res, 200, { message: 'Volunteer verification updated.', verification_status: status });
}));

module.exports = router;
module.exports.createAvailableVolunteersHandler = createAvailableVolunteersHandler;
module.exports.createVerifiedVolunteersHandler = createVerifiedVolunteersHandler;
module.exports.createUpdateAvailabilityHandler = createUpdateAvailabilityHandler;
