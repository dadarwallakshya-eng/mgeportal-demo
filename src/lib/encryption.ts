/**
 * @file src/lib/encryption.ts
 * @description AES-256-GCM symmetric encryption utility for protecting sensitive
 *              Personally Identifiable Information (PII) at rest in the database.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-change-in-production-12345';
const KEY = crypto.createHash('sha256').update(SECRET).digest(); // 32 bytes

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns the encrypted string in the format "iv:authTag:cipherText".
 */
export function encrypt(text: string | null | undefined): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed) return '';

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(trimmed, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a string formatted as "iv:authTag:cipherText".
 * If the input does not match this format, it is assumed to be existing
 * plaintext data and returned as-is for backwards compatibility.
 */
export function decrypt(encryptedStr: string | null | undefined): string {
  if (!encryptedStr) return '';
  const trimmed = encryptedStr.trim();
  if (!trimmed) return '';

  const parts = trimmed.split(':');
  // Backwards compatibility fallback: if not in "iv:authTag:cipherText" format, return as-is.
  if (parts.length !== 3) {
    return trimmed;
  }

  try {
    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[DECRYPT_ERROR] Failed to decrypt value, falling back to original:', err);
    return trimmed;
  }
}
