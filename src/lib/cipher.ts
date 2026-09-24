/**
 * @file src/lib/cipher.ts
 * @description Client and server safe symmetric XOR cipher for obfuscating file paths in URLs.
 *              Uses a static key to convert paths into URL-safe base64 tokens, hiding
 *              directory structures and preventing direct URL tampering/guessing.
 */

const OBFUSCATION_KEY = 'mge-portal-secure-key-1983';

/**
 * Obfuscates a path string into a URL-safe base64 token.
 * Compatible with Node.js and browser environments.
 */
export function obfuscatePath(path: string): string {
  if (!path) return '';
  const trimmed = path.trim();
  if (!trimmed) return '';

  let xorResult = '';
  for (let i = 0; i < trimmed.length; i++) {
    const charCode = trimmed.charCodeAt(i);
    const keyChar = OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
    xorResult += String.fromCharCode(charCode ^ keyChar);
  }

  // Convert binary string to base64url
  if (typeof window === 'undefined') {
    // Server-side (Node.js)
    return Buffer.from(xorResult, 'binary').toString('base64url');
  } else {
    // Client-side (Browser)
    const base64 = btoa(xorResult);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}

/**
 * Deobfuscates a URL-safe base64 token back into the original path string.
 * Returns null if token is invalid or fails decoding.
 */
export function deobfuscatePath(token: string): string | null {
  if (!token) return null;
  const trimmed = token.trim();
  if (!trimmed) return null;

  try {
    let binaryStr = '';
    if (typeof window === 'undefined') {
      // Server-side (Node.js)
      binaryStr = Buffer.from(trimmed, 'base64url').toString('binary');
    } else {
      // Client-side (Browser)
      let base64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      binaryStr = atob(base64);
    }

    let original = '';
    for (let i = 0; i < binaryStr.length; i++) {
      const charCode = binaryStr.charCodeAt(i);
      const keyChar = OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
      original += String.fromCharCode(charCode ^ keyChar);
    }
    return original;
  } catch (err) {
    console.error('[CIPHER_DEOBFUSCATE_ERROR]', err);
    return null;
  }
}
