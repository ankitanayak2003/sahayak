const express = require('express');
const { ObjectId } = require('mongodb');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const { getDB } = require('../config/mongodb');
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/requireRole');
const { ROLES } = require('../config/constants');

const router = express.Router();

function objectId(value) {
  return typeof value === 'string' && ObjectId.isValid(value) ? new ObjectId(value) : null;
}

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const id = objectId(req.params.id);
  if (!id) return error(res, 400, 'Invalid volunteer ID.');

  const profile = await getDB().collection('volunteers').findOne({ _id: id });
  if (!profile) return error(res, 404, 'Volunteer not found.');

  if (req.user.role !== ROLES.POLICE_ADMIN && String(profile.user_id) !== req.user.id) {
    return error(res, 403, 'Forbidden.');
  }

  return success(res, 200, { volunteer: profile });
}));

router.patch('/:id/availability', authenticate, requireRole(ROLES.VOLUNTEER, ROLES.POLICE_ADMIN), asyncHandler(async (req, res) => {
  const id = objectId(req.params.id);
  if (!id || typeof req.body?.is_available !== 'boolean') return error(res, 400, 'Invalid availability request.');

  const volunteers = getDB().collection('volunteers');
  const profile = await volunteers.findOne({ _id: id });
  if (!profile) return error(res, 404, 'Volunteer not found.');
  if (req.user.role !== ROLES.POLICE_ADMIN && String(profile.user_id) !== req.user.id) return error(res, 403, 'Forbidden.');

  await volunteers.updateOne({ _id: id }, { $set: { is_available: req.body.is_available, updated_at: new Date() } });
  return success(res, 200, { message: 'Volunteer availability updated.' });
}));

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
  await db.collection('volunteer_verifications').insertOne({ volunteer_id: id, verified_by: new ObjectId(req.user.id), verification_status: status, created_at: now, updated_at: now });
  return success(res, 200, { message: 'Volunteer verification updated.', verification_status: status });
}));

module.exports = router;
