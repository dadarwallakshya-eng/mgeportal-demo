/**
 * @module auth
 * @description Core authentication utilities for password hashing and JWT management.
 *
 * SECURITY DECISIONS:
 * - bcryptjs (pure JS) is used instead of native bcrypt to avoid native dependency issues
 *   and ensure portability across environments (Docker, serverless, Edge).
 * - jose is used instead of jsonwebtoken because jose is Edge Runtime compatible,
 *   which is required for Next.js middleware.
 * - Salt rounds set to 12 — balances security (≈250ms hash time) vs. UX.
 * - Token expiry is 1 hour to limit the window of a stolen token.
 * - The fallback secret is ONLY for local dev; production MUST set JWT_SECRET env var.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import bcrypt from 'bcryptjs';

/** Number of bcrypt salt rounds. 12 provides strong security without excessive latency. */
const SALT_ROUNDS = 12;

/**
 * JWT signing key derived from environment variable.
 * WARNING: The fallback secret is insecure — production deployments MUST
 * set the JWT_SECRET environment variable to a cryptographically random string (≥ 256 bits).
 */
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is missing in production!');
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-dev-secret-change-in-production'
);

/** Token lifetime. Short-lived to reduce risk of token theft. */
const TOKEN_EXPIRY = '1h';

/**
 * JWT payload shape for authenticated users.
 * Extends JWTPayload to ensure compatibility with jose verification output.
 */
export interface UserPayload extends JWTPayload {
  /** Unique token identifier for stateful revocation */
  jti: string;
  /** Database primary key (cuid/uuid) */
  userId: string;
  /** Unique login identifier */
  username: string;
  /** Role-based access control: 'ADMIN' | 'STAFF' | 'ACCOUNTANT' | 'TEACHER' etc. */
  role: string;
  /** Organisational units this user can access (e.g., branch IDs, department codes) */
  accessUnits: string[];
  /** Display name for UI */
  name: string;
  /** Hashed browser fingerprint to bind session to client device/IP */
  fingerprint?: string;
}

import crypto from 'crypto';

/**
 * Computes a SHA-256 fingerprint from user agent and IP address.
 */
export function computeFingerprint(userAgent: string | null, ip: string | null): string {
  const cleanUa = userAgent || 'no-ua';
  const cleanIp = (ip || 'no-ip').split(',')[0].trim();
  return crypto.createHash('sha256').update(`${cleanUa}|${cleanIp}`).digest('hex');
}

/**
 * Hash a plaintext password using bcrypt with 12 salt rounds.
 *
 * @param password - The plaintext password to hash.
 * @returns The bcrypt hash string (includes algorithm, cost, salt, and hash).
 *
 * @security Uses a per-hash random salt internally; never stores or reuses salts.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a bcrypt hash.
 *
 * @param password - The plaintext password to verify.
 * @param hash - The stored bcrypt hash.
 * @returns `true` if the password matches, `false` otherwise.
 *
 * @security Uses constant-time comparison internally (bcrypt.compare) to prevent
 * timing attacks. Never short-circuits on partial matches.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Create a signed JWT containing the user's identity and access claims.
 *
 * @param payload - User identity and authorization data to embed in the token.
 * @returns A compact JWS string (header.payload.signature).
 *
 * @security
 * - Uses HS256 (HMAC-SHA256) which is symmetric; the same secret signs and verifies.
 * - Token is set to expire in 1 hour (`exp` claim).
 * - `iat` (issued at) is automatically set by jose.
 * - Issuer is set to 'mge-portal' for token provenance validation.
 * - Stateful blacklist support is enabled via a unique JTI.
 */
export async function createToken(payload: Omit<UserPayload, 'iat' | 'exp' | 'iss' | 'jti'>): Promise<string> {
  const tokenJti = crypto.randomUUID();
  return new SignJWT({ ...payload, jti: tokenJti })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .setIssuer('mge-portal')
    .setJti(tokenJti)
    .sign(JWT_SECRET);
}

/**
 * Verify and decode a JWT, returning the typed user payload.
 *
 * @param token - The compact JWS string to verify.
 * @returns The decoded UserPayload if verification succeeds, or `null` if the token
 *          is invalid, expired, or has a mismatched issuer.
 *
 * @security
 * - Validates signature, expiration, and issuer in a single atomic operation.
 * - Returns null instead of throwing to prevent error-based information leakage.
 * - The caller should treat a null return as "unauthenticated" without distinguishing
 *   between invalid, expired, or tampered tokens.
 */
export async function verifyToken(token: string): Promise<UserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'mge-portal',
    });
    return payload as UserPayload;
  } catch {
    // Intentionally swallow all verification errors (expired, invalid signature,
    // malformed, wrong issuer) to avoid leaking token state to callers.
    return null;
  }
}

export interface MfaPendingPayload extends JWTPayload {
  userId: string;
  purpose: 'mfa-pending';
}

export async function createMfaPendingToken(userId: string): Promise<string> {
  return new SignJWT({ userId, purpose: 'mfa-pending' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m') // Valid for 5 minutes
    .setIssuer('mge-portal')
    .sign(JWT_SECRET);
}

export async function verifyMfaPendingToken(token: string): Promise<MfaPendingPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'mge-portal',
    });
    if (payload.purpose !== 'mfa-pending') return null;
    return payload as unknown as MfaPendingPayload;
  } catch {
    return null;
  }
}

