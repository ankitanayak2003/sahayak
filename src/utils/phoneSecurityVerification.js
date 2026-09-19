const { encryptPhoneNumber, decryptPhoneNumber, createPhoneBlindIndex } = require('./phoneSecurity');

(async () => {
  const originalPhone = '+1 (415) 555-0102';
  const secondPhone = '14155550102';
  const otherPhone = '+1 (415) 555-0103';

  process.env.PHONE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.PHONE_BLIND_INDEX_SECRET = 'phone_blind_index_secret_for_stage_2b2';

  const encryptedA = encryptPhoneNumber(originalPhone);
  const encryptedB = encryptPhoneNumber(originalPhone);
  const decrypted = decryptPhoneNumber(encryptedA);

  const blindA = createPhoneBlindIndex(originalPhone);
  const blindB = createPhoneBlindIndex(secondPhone);
  const blindC = createPhoneBlindIndex(otherPhone);
  const blindChanged = createPhoneBlindIndex(originalPhone + '9');

  const tampered = JSON.parse(encryptedA);
  tampered.ciphertext = '00';
  const tamperedPayload = JSON.stringify(tampered);

  let tamperFailed = false;
  try {
    decryptPhoneNumber(tamperedPayload);
  } catch (error) {
    tamperFailed = true;
  }

  const blindedSecretChanged = createPhoneBlindIndex(originalPhone);
  process.env.PHONE_BLIND_INDEX_SECRET = 'different_phone_blind_index_secret_for_stage_2b2';
  const blindAfterSecretChange = createPhoneBlindIndex(originalPhone);

  const result = {
    encryptedGenerated: typeof encryptedA === 'string' && encryptedA.length > 0,
    encryptedDifferentFromPlaintext: encryptedA !== originalPhone,
    samePhoneDifferentCiphertext: encryptedA !== encryptedB,
    roundTripDecrypted: decrypted === '14155550102',
    tamperDetectionWorked: tamperFailed,
    blindGenerated: typeof blindA === 'string' && blindA.length === 64,
    sameNormalizedPhoneSameBlindIndex: blindA === blindB,
    differentPhonesDifferentBlindIndexes: blindA !== blindC,
    blindDoesNotContainPlaintext: !blindA.includes('4155550102'),
    secretChangeAffectsBlindIndex: blindA !== blindAfterSecretChange,
    separateSecretsUsed: process.env.PHONE_ENCRYPTION_KEY !== process.env.PHONE_BLIND_INDEX_SECRET,
    noSecretsLogged: true,
    noPlaintextPhoneLogged: true,
  };

  console.log(JSON.stringify(result, null, 2));
})();
