const { getDB } = require('../../config/mongodb');
const logger = require('../../utils/logger');

const REFRESH_TOKENS_COLLECTION_NAME = 'refresh_tokens';
const REFRESH_TOKEN_HASH_INDEX_NAME = 'uniq_refresh_token_hash';
const REFRESH_TOKEN_FAMILY_INDEX_NAME = 'idx_refresh_token_family_id';
const REFRESH_TOKEN_USER_INDEX_NAME = 'idx_refresh_token_user_id';
const REFRESH_TOKEN_EXPIRY_INDEX_NAME = 'ttl_refresh_token_expires_at';

const refreshTokensValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'user_id',
      'token_hash',
      'token_family_id',
      'expires_at',
      'created_at',
      'updated_at',
    ],
    properties: {
      _id: { bsonType: 'objectId' },
      user_id: { bsonType: 'objectId' },
      token_hash: {
        bsonType: 'string',
        pattern: '^[a-fA-F0-9]{64}$',
      },
      token_family_id: {
        bsonType: 'string',
        minLength: 1,
      },
      expires_at: { bsonType: 'date' },
      revoked_at: { bsonType: ['date', 'null'] },
      created_at: { bsonType: 'date' },
      updated_at: { bsonType: 'date' },
    },
    additionalProperties: false,
  },
};

async function ensureRefreshTokensIndexes(db) {
  const refreshTokensCollection = db.collection(REFRESH_TOKENS_COLLECTION_NAME);
  const existingIndexes = await refreshTokensCollection.indexes();
  const existingIndexNames = new Set(existingIndexes.map((index) => index.name));

  const indexDefinitions = [
    {
      name: REFRESH_TOKEN_HASH_INDEX_NAME,
      key: { token_hash: 1 },
      options: { unique: true },
    },
    {
      name: REFRESH_TOKEN_FAMILY_INDEX_NAME,
      key: { token_family_id: 1 },
      options: {},
    },
    {
      name: REFRESH_TOKEN_USER_INDEX_NAME,
      key: { user_id: 1 },
      options: {},
    },
    {
      name: REFRESH_TOKEN_EXPIRY_INDEX_NAME,
      key: { expires_at: 1 },
      options: { expireAfterSeconds: 0 },
    },
  ];

  for (const indexDefinition of indexDefinitions) {
    if (existingIndexNames.has(indexDefinition.name)) {
      logger.info(`MongoDB refresh_tokens index already exists: ${indexDefinition.name}`);
      continue;
    }

    await refreshTokensCollection.createIndex(indexDefinition.key, {
      ...indexDefinition.options,
      name: indexDefinition.name,
    });

    logger.info(`Created MongoDB refresh_tokens index: ${indexDefinition.name}`);
  }
}

async function initRefreshTokensCollection() {
  const db = getDB();
  const collectionExists = await db.listCollections({ name: REFRESH_TOKENS_COLLECTION_NAME }).hasNext();

  const collectionOptions = {
    validator: refreshTokensValidator,
    validationLevel: 'strict',
    validationAction: 'error',
  };

  try {
    if (!collectionExists) {
      await db.createCollection(REFRESH_TOKENS_COLLECTION_NAME, collectionOptions);
      logger.info('Created MongoDB refresh_tokens collection with JSON Schema validation.');
    } else {
      await db.command({
        collMod: REFRESH_TOKENS_COLLECTION_NAME,
        ...collectionOptions,
      });

      logger.info('Updated MongoDB refresh_tokens collection validation rules.');
    }

    await ensureRefreshTokensIndexes(db);
  } catch (error) {
    logger.error(`Failed to initialize MongoDB refresh_tokens collection: ${error.message}`);
    throw error;
  }
}

module.exports = {
  initRefreshTokensCollection,
  refreshTokensValidator,
};
