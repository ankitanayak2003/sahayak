/**
 * initCoreIndexes.js
 * Ensures essential indexes exist across MongoDB collections for performance and query optimization.
 * Follows the existing index inspection pattern to avoid duplicate indexes.
 */

const { getDB } = require('../../config/mongodb');
const logger = require('../../utils/logger');

async function ensureCollectionIndexes(collection, indexDefs) {
  if (typeof collection.indexes !== 'function' || typeof collection.createIndex !== 'function') {
    return;
  }

  let existingIndexNames = new Set();
  try {
    const indexes = await collection.indexes();
    existingIndexNames = new Set(indexes.map((idx) => idx.name));
  } catch (error) {
    // If collection does not exist yet, creating an index will create it
  }

  for (const def of indexDefs) {
    if (!existingIndexNames.has(def.name)) {
      try {
        await collection.createIndex(def.key, def.options);
        logger.info(`Created index [${def.name}] on ${collection.collectionName}`);
      } catch (err) {
        logger.warn(`Could not create index [${def.name}] on ${collection.collectionName}: ${err.message}`);
      }
    }
  }
}

async function initCoreIndexes(dbInstance = null) {
  const db = dbInstance || getDB();

  // 1. assistance_requests
  await ensureCollectionIndexes(db.collection('assistance_requests'), [
    {
      name: 'idx_requests_volunteer',
      key: { current_assigned_volunteer_id: 1 },
      options: { sparse: true },
    },
    {
      name: 'idx_requests_status_created',
      key: { status: 1, created_at: -1 },
      options: {},
    },
    {
      name: 'idx_requests_created_at',
      key: { created_at: -1 },
      options: {},
    },
  ]);

  // 2. request_assignments
  await ensureCollectionIndexes(db.collection('request_assignments'), [
    {
      name: 'idx_assignments_request_id',
      key: { request_id: 1 },
      options: {},
    },
    {
      name: 'uniq_active_volunteer_assignment',
      key: { volunteer_id: 1 },
      options: {
        unique: true,
        partialFilterExpression: { status: 'active' },
      },
    },
  ]);

  // 3. request_status_history
  await ensureCollectionIndexes(db.collection('request_status_history'), [
    {
      name: 'idx_history_request_id',
      key: { request_id: 1, created_at: 1 },
      options: {},
    },
  ]);

  // 4. emergency_escalations
  await ensureCollectionIndexes(db.collection('emergency_escalations'), [
    {
      name: 'idx_escalations_request_id',
      key: { request_id: 1 },
      options: {},
    },
    {
      name: 'idx_escalations_resolution',
      key: { resolution_status: 1 },
      options: {},
    },
  ]);

  // 5. volunteers
  await ensureCollectionIndexes(db.collection('volunteers'), [
    {
      name: 'idx_volunteers_available_verified',
      key: { verification_status: 1, is_available: 1 },
      options: {},
    },
    {
      name: 'uniq_volunteers_user_id',
      key: { user_id: 1 },
      options: { unique: true },
    },
  ]);

  // 6. call_logs
  await ensureCollectionIndexes(db.collection('call_logs'), [
    {
      name: 'uniq_call_logs_call_sid',
      key: { call_sid: 1 },
      options: { unique: true, sparse: true },
    },
  ]);
}

module.exports = {
  initCoreIndexes,
  ensureCollectionIndexes,
};
