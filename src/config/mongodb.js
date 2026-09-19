const { MongoClient } = require('mongodb');
const env = require('./env');
const logger = require('../utils/logger');

const client = new MongoClient(env.MONGODB_URI);
let database;

async function connectMongoDB() {
  try {
    await client.connect();
    database = client.db(env.MONGODB_DB_NAME);
    logger.info(`Connected to MongoDB database: ${env.MONGODB_DB_NAME}`);
    return database;
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    throw error;
  }
}

function getDB() {
  if (!database) {
    throw new Error('MongoDB has not been connected. Call connectMongoDB() first.');
  }

  return database;
}

function startMongoSession() {
  return client.startSession();
}

async function closeMongoDB() {
  await client.close();
  database = undefined;
}

module.exports = {
  connectMongoDB,
  getDB,
  startMongoSession,
  closeMongoDB,
};
