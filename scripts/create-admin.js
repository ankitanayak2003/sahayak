const readline = require('readline');
const { connectMongoDB, closeMongoDB, getDB } = require('../src/config/mongodb');
const { initUsersCollection } = require('../src/database/mongodb/initUsersCollection');
const { ROLES } = require('../src/config/constants');
const { hashPassword } = require('../src/utils/password');
const { createPhoneBlindIndex, encryptPhoneNumber, normalizePhoneNumber } = require('../src/utils/phoneSecurity');

function promptLine(question) {
  return new Promise((resolve, reject) => {
    const input = readline.createInterface({ input: process.stdin, output: process.stdout });
    input.question(question, (answer) => {
      input.close();
      resolve(answer.trim());
    });
    input.on('error', reject);
  });
}

function promptHidden(question) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('An interactive terminal is required for password input.');
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk) => {
      const input = chunk.toString('utf8');
      for (const character of input) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Admin creation cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    };
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.removeListener('data', onData);
    };

    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeAndValidatePhone(phone) {
  const normalized = normalizePhoneNumber(phone);
  if (normalized.length < 10 || normalized.length > 15) {
    throw new Error('Phone number must contain between 10 and 15 digits.');
  }
  return normalized;
}

async function createAdmin() {
  const name = await promptLine('Admin name: ');
  const email = (await promptLine('Admin email: ')).toLowerCase();
  const phone = await promptLine('Admin phone: ');
  const password = await promptHidden('Password: ');
  const confirmation = await promptHidden('Confirm password: ');

  if (!name) throw new Error('Admin name is required.');
  if (!isValidEmail(email)) throw new Error('Admin email is invalid.');
  if (!password || password.length < 8) throw new Error('Password must be at least 8 characters long.');
  if (password !== confirmation) throw new Error('Passwords do not match.');

  const normalizedPhone = normalizeAndValidatePhone(phone);
  const db = getDB();
  const users = db.collection('users');
  const phoneBlindIndex = createPhoneBlindIndex(normalizedPhone);

  const [existingEmail, existingPhone] = await Promise.all([
    users.findOne({ email }, { collation: { locale: 'en', strength: 2 } }),
    users.findOne({ phone_number_blind_index: phoneBlindIndex }),
  ]);
  if (existingEmail) throw new Error('An account with this email already exists.');
  if (existingPhone) throw new Error('An account with this phone already exists.');

  const now = new Date();
  try {
    const result = await users.insertOne({
      name,
      phone_number_encrypted: encryptPhoneNumber(normalizedPhone),
      phone_number_blind_index: phoneBlindIndex,
      email,
      password_hash: await hashPassword(password),
      role: ROLES.POLICE_ADMIN,
      account_status: 'active',
      created_at: now,
      updated_at: now,
    });
    console.log(`Admin account created: ${result.insertedId}`);
  } catch (error) {
    if (error.code === 11000) {
      throw new Error('An account with this email or phone already exists.');
    }
    throw error;
  }
}

async function main() {
  try {
    await connectMongoDB();
    await initUsersCollection();
    await createAdmin();
  } finally {
    await closeMongoDB();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Admin creation failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createAdmin, main };