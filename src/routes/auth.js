const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const { hashPassword, verifyPassword } = require('../utils/password');
const { generateAccessToken } = require('../utils/jwt');
const { generateRefreshToken, hashRefreshToken } = require('../utils/refreshToken');
const { getDB, startMongoSession } = require('../config/mongodb');
const { createPhoneBlindIndex, encryptPhoneNumber, normalizePhoneNumber } = require('../utils/phoneSecurity');
const { verifyOtpForPhone } = require('../utils/otpService');
const { ROLES } = require('../config/constants');

const router = express.Router();
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const INVALID_REFRESH_TOKEN_CODE = 'INVALID_REFRESH_TOKEN';
const DUMMY_PASSWORD_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeAndValidatePhone(phoneNumber) {
  if (typeof phoneNumber !== 'string') return null;

  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    return normalizedPhone.length >= 10 && normalizedPhone.length <= 15 ? normalizedPhone : null;
  } catch (phoneError) {
    return null;
  }
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, phone_number: phoneNumber, password, otp, role } = req.body || {};

    if (role && role !== ROLES.VOLUNTEER) {
      return error(res, 400, 'Public registration only supports volunteer accounts.');
    }

    if (typeof name !== 'string' || !name.trim()) {
      return error(res, 400, 'Name is required.');
    }
    if (typeof email !== 'string' || !email.trim()) {
      return error(res, 400, 'Email is required.');
    }
    if (typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
      return error(res, 400, 'Phone number is required.');
    }
    if (typeof password !== 'string' || !password) {
      return error(res, 400, 'Password is required.');
    }
    if (password.length < 8) {
      return error(res, 400, 'Password must be at least 8 characters long.');
    }
    if (typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
      return error(res, 400, 'OTP is required and must be 6 digits.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      return error(res, 400, 'Email format is invalid.');
    }

    const normalizedPhone = normalizeAndValidatePhone(phoneNumber);
    if (!normalizedPhone) {
      return error(res, 400, 'Phone number is invalid.');
    }

    const otpValid = verifyOtpForPhone(normalizedPhone, otp.trim());
    if (!otpValid) {
      return error(res, 400, 'OTP verification failed or expired.');
    }

    const users = getDB().collection('users');
    const phoneBlindIndex = createPhoneBlindIndex(normalizedPhone);
    const [existingEmailUser, existingPhoneUser] = await Promise.all([
      users.findOne({ email: normalizedEmail }),
      users.findOne({ phone_number_blind_index: phoneBlindIndex }),
    ]);

    if (existingEmailUser) {
      return error(res, 409, 'A user with this email already exists.');
    }
    if (existingPhoneUser) {
      return error(res, 409, 'A user with this phone number already exists.');
    }

    const now = new Date();
    const userDocument = {
      name: name.trim(),
      email: normalizedEmail,
      phone_number_encrypted: encryptPhoneNumber(normalizedPhone),
      phone_number_blind_index: phoneBlindIndex,
      password_hash: await hashPassword(password),
      role: ROLES.VOLUNTEER,
      account_status: 'pending',
      created_at: now,
      updated_at: now,
    };

    try {
      const result = await users.insertOne(userDocument);
      await getDB().collection('volunteers').insertOne({
        user_id: result.insertedId,
        verification_status: 'pending',
        is_available: false,
        created_at: now,
        updated_at: now,
      });

      return success(res, 201, {
        userId: result.insertedId,
        name: userDocument.name,
        email: userDocument.email,
        phone_number: normalizedPhone,
        role: userDocument.role,
        account_status: userDocument.account_status,
        message: 'Registration submitted for verification.',
      });
    } catch (insertError) {
      if (insertError && insertError.code === 11000) {
        return error(res, 409, 'A user with this email or phone number already exists.');
      }

      throw insertError;
    }
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || !email.trim()) {
      return error(res, 400, 'Email is required.');
    }
    if (typeof password !== 'string' || !password) {
      return error(res, 400, 'Password is required.');
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      return error(res, 400, 'Email format is invalid.');
    }

    const users = getDB().collection('users');
    const user = await users.findOne({ email: normalizedEmail });
    const volunteerProfile = user && user.role === ROLES.VOLUNTEER
      ? await getDB().collection('volunteers').findOne({ user_id: user._id })
      : null;

    const hashToVerify = user?.password_hash || DUMMY_PASSWORD_HASH;
    let passwordMatch = false;
    try {
      passwordMatch = await verifyPassword(password, hashToVerify);
    } catch {
      passwordMatch = false;
    }

    if (!user || user.account_status !== 'active' || (user.role === ROLES.VOLUNTEER && volunteerProfile?.verification_status !== 'verified') || !passwordMatch) {
      return error(res, 401, 'Invalid email or password.');
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    const tokenFamilyId = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);
    const now = new Date();

    await getDB().collection('refresh_tokens').insertOne({
      user_id: user._id,
      token_hash: tokenHash,
      token_family_id: tokenFamilyId,
      expires_at: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      revoked_at: null,
      created_at: now,
      updated_at: now,
    });

    return success(res, 200, {
      userId: user._id,
      email: user.email,
      role: user.role,
      account_status: user.account_status,
      volunteerId: volunteerProfile?._id || undefined,
      accessToken,
      refreshToken,
      message: 'Login successful.',
    });
  })
);

function isTransactionUnsupportedError(error) {
  if (!error) return false;
  const msg = String(error.message || '');
  return (
    error.code === 20 ||
    /transaction numbers are only allowed on a replica set/i.test(msg) ||
    /transactions are not supported/i.test(msg) ||
    /standalone/i.test(msg) ||
    /Cannot call withTransaction/i.test(msg)
  );
}

async function executeRefreshRotation(db, refreshToken, session = null) {
  const sessionOptions = session ? { session } : {};
  const now = new Date();
  const refreshTokens = db.collection('refresh_tokens');
  const users = db.collection('users');
  const tokenHash = hashRefreshToken(refreshToken);

  const matchedRecord = await refreshTokens.findOne(
    { token_hash: tokenHash },
    sessionOptions
  );

  if (!matchedRecord) {
    const invalidTokenError = new Error('Invalid refresh token.');
    invalidTokenError.code = INVALID_REFRESH_TOKEN_CODE;
    throw invalidTokenError;
  }

  if (matchedRecord.revoked_at !== null) {
    await refreshTokens.updateMany(
      { token_family_id: matchedRecord.token_family_id },
      {
        $set: {
          revoked_at: now,
          updated_at: now,
        },
      },
      sessionOptions
    );
    return { reuseDetected: true };
  }

  if (matchedRecord.expires_at <= now) {
    const invalidTokenError = new Error('Invalid refresh token.');
    invalidTokenError.code = INVALID_REFRESH_TOKEN_CODE;
    throw invalidTokenError;
  }

  const result = await refreshTokens.findOneAndUpdate(
    {
      token_hash: tokenHash,
      revoked_at: null,
      expires_at: { $gt: now },
    },
    {
      $set: {
        revoked_at: now,
        updated_at: now,
      },
    },
    {
      ...sessionOptions,
      returnDocument: 'before',
    }
  );
  const oldRefreshToken = result?.value ?? result;

  if (!oldRefreshToken) {
    const invalidTokenError = new Error('Invalid refresh token.');
    invalidTokenError.code = INVALID_REFRESH_TOKEN_CODE;
    throw invalidTokenError;
  }

  const user = await users.findOne(
    { _id: oldRefreshToken.user_id },
    sessionOptions
  );

  if (!user || user.account_status !== 'active') {
    const invalidTokenError = new Error('Invalid refresh token.');
    invalidTokenError.code = INVALID_REFRESH_TOKEN_CODE;
    throw invalidTokenError;
  }

  const accessToken = generateAccessToken(user);
  const replacementRefreshToken = generateRefreshToken();
  const replacementTokenHash = hashRefreshToken(replacementRefreshToken);

  await refreshTokens.insertOne(
    {
      user_id: oldRefreshToken.user_id,
      token_hash: replacementTokenHash,
      token_family_id: oldRefreshToken.token_family_id,
      expires_at: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      revoked_at: null,
      created_at: now,
      updated_at: now,
    },
    sessionOptions
  );

  return {
    reuseDetected: false,
    rotation: {
      accessToken,
      refreshToken: replacementRefreshToken,
    },
  };
}

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};

    if (typeof refreshToken !== 'string' || !refreshToken.trim()) {
      return error(res, 401, 'Invalid refresh token.');
    }

    const db = getDB();
    const session = startMongoSession();
    let result;

    try {
      await session.withTransaction(async () => {
        result = await executeRefreshRotation(db, refreshToken, session);
      });
    } catch (refreshError) {
      if (isTransactionUnsupportedError(refreshError)) {
        try {
          result = await executeRefreshRotation(db, refreshToken, null);
        } catch (fallbackError) {
          if (fallbackError.code === INVALID_REFRESH_TOKEN_CODE) {
            return error(res, 401, 'Invalid refresh token.');
          }
          return error(res, 500, 'Unable to refresh token.');
        }
      } else if (refreshError.code === INVALID_REFRESH_TOKEN_CODE) {
        return error(res, 401, 'Invalid refresh token.');
      } else {
        return error(res, 500, 'Unable to refresh token.');
      }
    } finally {
      await session.endSession();
    }

    if (!result || result.reuseDetected) {
      return error(res, 401, 'Invalid refresh token.');
    }

    return success(res, 200, {
      accessToken: result.rotation.accessToken,
      refreshToken: result.rotation.refreshToken,
      message: 'Token refreshed successfully.',
    });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};

    if (typeof refreshToken !== 'string' || !refreshToken.trim()) {
      return error(res, 400, 'Refresh token is required.');
    }

    try {
      const now = new Date();
      const refreshTokenHash = hashRefreshToken(refreshToken);

      await getDB().collection('refresh_tokens').updateOne(
        {
          token_hash: refreshTokenHash,
          revoked_at: null,
        },
        {
          $set: {
            revoked_at: now,
            updated_at: now,
          },
        }
      );
    } catch (logoutError) {
      return error(res, 500, 'Unable to log out.');
    }

    return success(res, 200, {
      message: 'Logout successful.',
    });
  })
);

module.exports = router;
