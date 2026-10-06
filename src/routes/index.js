/**
 * routes/index.js
 * Top-level router. In later stages, each feature module will
 * mount its own router here (e.g. router.use('/auth', authRoutes)).
 * Stage 1 only has the health check.
 */

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const { STATUS } = require('../config/constants');
const { getDB } = require('../config/mongodb');
const redisClient = require('../config/redis');
const volunteersRoutes = require('./volunteers');
const volunteerBusinessRoutes = require('./volunteerBusiness');
const authRoutes = require('./auth');
const requestsRoutes = require('./requests');
const emergenciesRoutes = require('./emergencies');
const voiceRoutes = require('./voice');
const sarvamRoutes = require('./sarvam');
const { healthLiveHandler, healthReadyHandler, legacyHealthHandler } = require('./health');

const router = express.Router();

router.use('/volunteers', volunteersRoutes);
router.use('/volunteers', volunteerBusinessRoutes);
router.use('/auth', authRoutes);
router.use('/requests', requestsRoutes);
router.use('/emergencies', emergenciesRoutes);
router.use('/voice', voiceRoutes);
router.use('/sarvam', sarvamRoutes);

// Health check endpoints
router.get('/health/live', healthLiveHandler);
router.get('/health/ready', healthReadyHandler);
router.get('/health', legacyHealthHandler);

module.exports = router;
