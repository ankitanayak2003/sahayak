const test = require('node:test');
const assert = require('node:assert/strict');
const { generateOtpForPhone, verifyOtpForPhone, MAX_OTP_ATTEMPTS } = require('../src/utils/otpService');
const { validateClassification, GeminiClassificationError } = require('../src/services/geminiService');
const { verifyPassword } = require('../src/utils/password');

// --------------------------------------------------------------------------
// FIX 18: LOGIN TIMING CONSISTENCY
// --------------------------------------------------------------------------

test('FIX 18: Dummy hash verification produces safe false match without crashing', async () => {
  const DUMMY_PASSWORD_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  const match = await verifyPassword('arbitrary-user-password', DUMMY_PASSWORD_HASH);
  assert.equal(match, false);
});

// --------------------------------------------------------------------------
// FIX 19: OTP BRUTE FORCE PROTECTION
// --------------------------------------------------------------------------

test('FIX 19: OTP lockout enforces MAX_OTP_ATTEMPTS and invalidates OTP after too many failures', async () => {
  const phone = '9123456789';
  const correctOtp = await generateOtpForPhone(phone);

  assert.equal(MAX_OTP_ATTEMPTS, 5);

  // 1st through 4th incorrect attempts fail
  for (let attempt = 1; attempt < MAX_OTP_ATTEMPTS; attempt += 1) {
    const ok = await verifyOtpForPhone(phone, '000000');
    assert.equal(ok, false, `Attempt ${attempt} should fail`);
  }

  // 5th incorrect attempt reaches MAX_OTP_ATTEMPTS and deletes the OTP
  const fifthAttempt = await verifyOtpForPhone(phone, '000000');
  assert.equal(fifthAttempt, false);

  // Now even providing the CORRECT OTP must fail because the OTP record was purged
  const attemptWithCorrectOtp = await verifyOtpForPhone(phone, correctOtp);
  assert.equal(attemptWithCorrectOtp, false, 'Correct OTP should fail after exceeding max attempts');
});

test('FIX 19: Successful OTP verification invalidates the OTP immediately', async () => {
  const phone = '9811122233';
  const correctOtp = await generateOtpForPhone(phone);

  const firstAttempt = await verifyOtpForPhone(phone, correctOtp);
  assert.equal(firstAttempt, true);

  const reuseAttempt = await verifyOtpForPhone(phone, correctOtp);
  assert.equal(reuseAttempt, false);
});

test('FIX 19: Malformed or non-string phone number fails OTP verification safely', async () => {
  assert.equal(await verifyOtpForPhone(null, '123456'), false);
  assert.equal(await verifyOtpForPhone('', '123456'), false);
  assert.equal(await verifyOtpForPhone('anonymous', '123456'), false);
});

// --------------------------------------------------------------------------
// FIX 20: GEMINI CLASSIFICATION RESILIENCE & BOUNDING
// --------------------------------------------------------------------------

test('FIX 20: validateClassification rejects prompt-injected or invalid types and dispositions', () => {
  // Invalid emergency_type
  assert.throws(() => validateClassification({
    is_emergency: true,
    emergency_type: 'drop_database',
    severity: 'critical',
    disposition: 'emergency',
    reason: 'Malicious classification attempt',
  }), GeminiClassificationError);

  // Invalid disposition
  assert.throws(() => validateClassification({
    is_emergency: true,
    emergency_type: 'medical',
    severity: 'critical',
    disposition: 'system_override',
    reason: 'Malicious classification attempt',
  }), GeminiClassificationError);

  // Invalid is_emergency type
  assert.throws(() => validateClassification({
    is_emergency: 'true',
    emergency_type: 'medical',
    severity: 'critical',
    disposition: 'emergency',
    reason: 'String instead of boolean',
  }), GeminiClassificationError);
});

test('FIX 20: validateClassification caps excessively long reason strings to 1000 chars', () => {
  const hugeReason = 'A'.repeat(5000);
  const result = validateClassification({
    is_emergency: true,
    emergency_type: 'medical',
    severity: 'high',
    disposition: 'emergency',
    reason: hugeReason,
  });

  assert.equal(result.reason.length, 1000);
});
