/**
 * Encryption and Decryption Utilities
 * Handles secure storage of sensitive data like API tokens and credentials
 */

const crypto = require('crypto');

// Algorithm and configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

/**
 * Get encryption key from environment or generate one
 * In production, this should be stored securely (env var, secrets manager, etc.)
 */
function getEncryptionKey() {
  let key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    console.warn('WARNING: ENCRYPTION_KEY not set. Generating temporary key.');
    console.warn('This key will be lost when the application restarts!');
    console.warn('Set ENCRYPTION_KEY environment variable for persistent encryption.');
    key = crypto.randomBytes(KEY_LENGTH).toString('hex');
  }

  // Ensure key is proper length
  if (key.length < KEY_LENGTH * 2) { // hex encoding doubles length
    // Derive key from provided string
    return crypto.scryptSync(key, 'salt', KEY_LENGTH);
  }

  return Buffer.from(key.substring(0, KEY_LENGTH * 2), 'hex');
}

/**
 * Encrypt sensitive data
 * @param {string|object} data - Data to encrypt (will be JSON stringified if object)
 * @returns {string} Encrypted data as hex string with IV and auth tag
 */
function encrypt(data) {
  try {
    // Convert object to JSON string
    const plaintext = typeof data === 'string' ? data : JSON.stringify(data);

    // Generate IV (initialization vector)
    const iv = crypto.randomBytes(IV_LENGTH);

    // Get encryption key
    const key = getEncryptionKey();

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt data
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine IV + auth tag + encrypted data
    const result = iv.toString('hex') + authTag.toString('hex') + encrypted;

    return result;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt sensitive data
 * @param {string} encryptedData - Encrypted hex string with IV and auth tag
 * @param {boolean} parseJSON - Whether to parse result as JSON (default: true)
 * @returns {string|object} Decrypted data
 */
function decrypt(encryptedData, parseJSON = true) {
  try {
    // Extract IV, auth tag, and encrypted data
    const iv = Buffer.from(encryptedData.substring(0, IV_LENGTH * 2), 'hex');
    const authTag = Buffer.from(
      encryptedData.substring(IV_LENGTH * 2, (IV_LENGTH + AUTH_TAG_LENGTH) * 2),
      'hex'
    );
    const encrypted = encryptedData.substring((IV_LENGTH + AUTH_TAG_LENGTH) * 2);

    // Get encryption key
    const key = getEncryptionKey();

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    // Parse JSON if requested
    if (parseJSON) {
      try {
        return JSON.parse(decrypted);
      } catch (e) {
        // Not valid JSON, return as string
        return decrypted;
      }
    }

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Hash password or sensitive string (one-way)
 * @param {string} password - Password to hash
 * @returns {string} Hashed password
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify password against hash
 * @param {string} password - Password to verify
 * @param {string} storedHash - Stored hash to verify against
 * @returns {boolean} True if password matches
 */
function verifyPassword(password, storedHash) {
  try {
    const [salt, hash] = storedHash.split(':');
    const derivedHash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
    return hash === derivedHash;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

/**
 * Generate a secure random token
 * @param {number} length - Token length in bytes (default: 32)
 * @returns {string} Random token as hex string
 */
function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate webhook secret
 * @returns {string} Webhook secret
 */
function generateWebhookSecret() {
  return generateToken(32);
}

/**
 * Validate HMAC signature for webhooks
 * @param {string} payload - Request payload
 * @param {string} signature - Provided signature
 * @param {string} secret - Webhook secret
 * @returns {boolean} True if signature is valid
 */
function validateWebhookSignature(payload, signature, secret) {
  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSignature = 'sha256=' + hmac.digest('hex');
    
    // Use timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Webhook signature validation error:', error);
    return false;
  }
}

/**
 * Test encryption/decryption
 */
function testEncryption() {
  try {
    const testData = {
      token: 'test-token-123',
      apiKey: 'secret-key',
      user: 'test@example.com',
    };

    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);

    const success = JSON.stringify(testData) === JSON.stringify(decrypted);
    
    if (success) {
      console.log('   ✓ Encryption test: PASSED');
    } else {
      console.error('   ✗ Encryption test: FAILED');
    }

    return success;
  } catch (error) {
    console.error('   ✗ Encryption test error:', error);
    return false;
  }
}

module.exports = {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  generateToken,
  generateWebhookSecret,
  validateWebhookSignature,
  testEncryption,
};
