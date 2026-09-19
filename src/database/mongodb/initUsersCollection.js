/**
 * initUsersCollection.js
 * Ensures the MongoDB users collection exists with the required
 * Stage 2A.5 JSON Schema validation. This keeps validation logic
 * separate from connection management and avoids deleting existing data.
 */

const { getDB } = require('../../config/mongodb');
const logger = require('../../utils/logger');

const USERS_COLLECTION_NAME = 'users';
const USERS_PHONE_BLIND_INDEX_NAME = 'uniq_phone_number_blind_index_non_null';
const USERS_EMAIL_INDEX_NAME = 'uniq_email_case_insensitive';

const usersValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['password_hash', 'role', 'account_status', 'created_at', 'updated_at'],
    properties: {
      _id: { bsonType: 'objectId' },
      phone_number_encrypted: {
        bsonType: ['string', 'binData'],
      },
      phone_number_blind_index: {
        bsonType: 'string',
        pattern: '^[a-fA-F0-9]{64}$',
      },
      email: {
        bsonType: 'string',
      },
      password_hash: {
        bsonType: 'string',
      },
      role: {
        bsonType: 'string',
        enum: ['volunteer', 'police_admin'],
      },
      account_status: {
        bsonType: 'string',
        enum: ['active', 'suspended', 'deleted'],
      },
      created_at: {
        bsonType: 'date',
      },
      updated_at: {
        bsonType: 'date',
      },
    },
    additionalProperties: true,
  },
};

async function ensureUsersIndexes(db) {
  const usersCollection = db.collection(USERS_COLLECTION_NAME);
  const existingIndexes = await usersCollection.indexes();
  const existingIndexNames = new Set(existingIndexes.map((index) => index.name));

  const indexDefinitions = [
    {
      name: USERS_PHONE_BLIND_INDEX_NAME,
      key: { phone_number_blind_index: 1 },
      options: {
        unique: true,
        partialFilterExpression: {
          phone_number_blind_index: { $exists: true, $type: 'string' },
        },
      },
    },
    {
      name: USERS_EMAIL_INDEX_NAME,
      key: { email: 1 },
      options: {
        unique: true,
        partialFilterExpression: {
          email: { $exists: true, $type: 'string' },
        },
        collation: {
          locale: 'en',
          strength: 2,
        },
      },
    },
  ];

  for (const indexDefinition of indexDefinitions) {
    if (existingIndexNames.has(indexDefinition.name)) {
      logger.info(`MongoDB users index already exists: ${indexDefinition.name}`);
      continue;
    }

    await usersCollection.createIndex(indexDefinition.key, {
      ...indexDefinition.options,
      name: indexDefinition.name,
    });

    logger.info(`Created MongoDB users index: ${indexDefinition.name}`);
  }
}

async function initUsersCollection() {
  const db = getDB();
  const collectionExists = await db.listCollections({ name: USERS_COLLECTION_NAME }).hasNext();

  const collectionOptions = {
    validator: usersValidator,
    validationLevel: 'strict',
    validationAction: 'error',
  };

  try {
    if (!collectionExists) {
      await db.createCollection(USERS_COLLECTION_NAME, collectionOptions);
      logger.info('Created MongoDB users collection with JSON Schema validation.');
    } else {
      await db.command({
        collMod: USERS_COLLECTION_NAME,
        ...collectionOptions,
      });

      logger.info('Updated MongoDB users collection validation rules.');
    }

    await ensureUsersIndexes(db);
  } catch (error) {
    logger.error(`Failed to initialize MongoDB users collection: ${error.message}`);
    throw error;
  }
}

module.exports = {
  initUsersCollection,
  usersValidator,
};
