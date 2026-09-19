const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const { hashPassword, verifyPassword } = require('../utils/password');
const { generateAccessToken } = require('../utils/jwt');
const { generateRefreshToken, hashRefreshToken } = require('../utils/refreshToken');
const { getDB, startMongoSession } = require('../config/mongodb');
const { createPhoneBlindIndex, encryptPhoneNumber, normalizePhoneNumber } = require('../utils/phoneSecurity');
const { ROLES } = require('../config/constants');

const router = express.Router();
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const INVALID_REFRESH_TOKEN_CODE = 'INVALID_REFRESH_TOKEN';

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
    const { name, email, phone_number: phoneNumber, password, role } = req.body || {};

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
    if (role !== ROLES.VOLUNTEER && role !== ROLES.POLICE_ADMIN) {
      return error(res, 400, 'Role is invalid.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      return error(res, 400, 'Email format is invalid.');
    }

    const normalizedPhone = normalizeAndValidatePhone(phoneNumber);
    if (!normalizedPhone) {
      return error(res, 400, 'Phone number is invalid.');
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
      role,
      account_status: 'active',
      created_at: now,
      updated_at: now,
    };

    try {
      const result = await users.insertOne(userDocument);

      return success(res, 201, {
        userId: result.insertedId,
        name: userDocument.name,
        email: userDocument.email,
        phone_number: normalizedPhone,
        role: userDocument.role,
        account_status: userDocument.account_status,
        message: 'Registration successful.',
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

    if (!user || user.account_status !== 'active' || !(await verifyPassword(password, user.password_hash))) {
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
      accessToken,
      refreshToken,
      message: 'Login successful.',
    });
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};

    if (typeof refreshToken !== 'string' || !refreshToken.trim()) {
      return error(res, 401, 'Invalid refresh token.');
    }

    const db = getDB();
    const session = startMongoSession();
    let rotation;
    let reuseDetected = false;

    try {
      await session.withTransaction(async () => {
        const now = new Date();
        const refreshTokens = db.collection('refresh_tokens');
        const users = db.collection('users');
        const tokenHash = hashRefreshToken(refreshToken);
        const matchedRecord = await refreshTokens.findOne(
          { token_hash: tokenHash },
          { session }
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
            { session }
          );
          reuseDetected = true;
          return;
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
            session,
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
          { session }
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
          { session }
        );

        rotation = {
          accessToken,
          refreshToken: replacementRefreshToken,
        };
      });
    } catch (refreshError) {
      if (refreshError.code === INVALID_REFRESH_TOKEN_CODE) {
        return error(res, 401, 'Invalid refresh token.');
      }

      return error(res, 500, 'Unable to refresh token.');
    } finally {
      await session.endSession();
    }

    if (reuseDetected) {
      return error(res, 401, 'Invalid refresh token.');
    }

    return success(res, 200, {
      accessToken: rotation.accessToken,
      refreshToken: rotation.refreshToken,
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
