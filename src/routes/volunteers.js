const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const { hashPassword } = require('../utils/password');
const { createPhoneBlindIndex, encryptPhoneNumber, normalizePhoneNumber, isValidPhone } = require('../utils/phoneSecurity');
const { generateOtpForPhone, verifyOtpForPhone } = require('../utils/otpService');
const { sendOtpRateLimiter } = require('../middleware/rateLimiter');
const { getDB } = require('../config/mongodb');

const router = express.Router();

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidOtp(otp) {
  return typeof otp === 'string' && /^\d{6}$/.test(otp.trim());
}

function isStrongPassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, phone_number, email, password, otp } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return error(res, 400, 'Name is required.');
    }
    if (!phone_number) {
      return error(res, 400, 'Phone number is required.');
    }
    if (!email) {
      return error(res, 400, 'Email is required.');
    }
    if (!password) {
      return error(res, 400, 'Password is required.');
    }
    if (!otp) {
      return error(res, 400, 'OTP is required.');
    }

    const normalizedName = name.trim();

    if (!isValidPhone(phone_number)) {
      return error(res, 400, 'Phone number is invalid.');
    }

    const normalizedPhone = normalizePhoneNumber(phone_number);
    if (!isValidEmail(email)) {
      return error(res, 400, 'Email format is invalid.');
    }
    if (!isValidOtp(otp)) {
      return error(res, 400, 'OTP format is invalid.');
    }
    if (!isStrongPassword(password)) {
      return error(res, 400, 'Password must be at least 8 characters long.');
    }

    const db = getDB();
    const users = db.collection('users');

    const phoneBlindIndex = createPhoneBlindIndex(normalizedPhone);
    const existingPhoneUser = await users.findOne({ phone_number_blind_index: phoneBlindIndex });
    if (existingPhoneUser) {
      return error(res, 409, 'A user with this phone number already exists.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingEmailUser = await users.findOne({ email: { $regex: `^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    if (existingEmailUser) {
      return error(res, 409, 'A user with this email already exists.');
    }

    const otpValid = await verifyOtpForPhone(normalizedPhone, otp);
    if (!otpValid) {
      return error(res, 400, 'OTP verification failed or expired.');
    }

    const encryptedPhone = encryptPhoneNumber(normalizedPhone);
    const passwordHash = await hashPassword(password);
    const now = new Date();

    const userDoc = {
      name: normalizedName,
      phone_number_encrypted: encryptedPhone,
      phone_number_blind_index: phoneBlindIndex,
      email: normalizedEmail,
      password_hash: passwordHash,
      role: 'volunteer',
      account_status: 'pending',
      created_at: now,
      updated_at: now,
    };

    try {
      const result = await users.insertOne(userDoc);
      await db.collection('volunteers').insertOne({
        user_id: result.insertedId,
        verification_status: 'pending',
        is_available: false,
        created_at: now,
        updated_at: now,
      });

      return success(res, 201, {
        success: true,
        message: 'Volunteer registration submitted for verification.',
        userId: result.insertedId,
        role: 'volunteer',
        account_status: 'pending',
      });
    } catch (error) {
      if (error && error.code === 11000) {
        return error(res, 409, 'This phone number or email is already registered.');
      }

      throw error;
    }
  })
);

const handleOtpGeneration = asyncHandler(async (req, res) => {
  const { phone_number } = req.body || {};

  if (!phone_number) {
    return error(res, 400, 'Phone number is required.');
  }

  if (!isValidPhone(phone_number)) {
    return error(res, 400, 'Phone number is invalid.');
  }

  const otp = await generateOtpForPhone(phone_number);

  return success(res, 200, {
    message: 'OTP generated successfully.',
    otp,
    expiresInSeconds: 300,
  });
});

router.post('/generate-otp', sendOtpRateLimiter, handleOtpGeneration);
router.post('/send-otp', sendOtpRateLimiter, handleOtpGeneration);

module.exports = router;
