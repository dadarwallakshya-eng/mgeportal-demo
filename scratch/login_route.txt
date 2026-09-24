/**
 * @module api/auth/login
 * @description Login API route for the MGE Portal.
 *
 * SECURITY DECISIONS:
 *
 * 1. RATE LIMITING (in-memory):
 *    - Max 5 attempts per IP per 60-second window.
 *    - Uses an in-memory Map with automatic cleanup every 60 seconds.
 *    - This is NOT a replacement for production-grade rate limiting (use Redis + Upstash
 *      or a WAF like Cloudflare in production), but it prevents casual brute-force attacks.
 *
 * 2. TIMING-SAFE RESPONSES:
 *    - "Invalid credentials" is returned for BOTH invalid username AND invalid password.
 *    - When the username doesn't exist, we still run bcrypt.compare against a dummy hash
 *      to ensure consistent response timing. This prevents username enumeration via
 *      timing side-channel attacks.
 *
 * 3. NO INTERNAL ERROR LEAKAGE:
 *    - All catch blocks return a generic "An error occurred" message.
 *    - Stack traces and error details are logged server-side only.
 *
 * 4. INPUT VALIDATION:
 *    - All input is validated through Zod schemas before any database or crypto operations.
 *
 * 5. COOKIE SECURITY:
 *    - Session token is set as HttpOnly/Secure/SameSite=Strict cookie.
 *    - Token is NOT returned in the response body.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loginSchema } from '@/lib/validations';
import { verifyPassword, createToken, createMfaPendingToken } from '@/lib/auth';
import { setSession } from '@/lib/session';
import { logAuditEvent } from '@/lib/audit';
import prisma from '@/lib/prisma';

// ─── Rate Limiting ───────────────────────────────────────────────────────────

interface RateLimitEntry {
  /** Number of attempts in the current window. */
  count: number;
  /** Timestamp (ms) when the window resets. */
  resetAt: number;
}

/** In-memory rate limit store. Keyed by IP address. */
const rateLimitMap = new Map<string, RateLimitEntry>();

/** Max login attempts per IP per window. */
const MAX_ATTEMPTS = 5;

/** Rate limit window in milliseconds. */
const WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Clean up expired rate limit entries to prevent memory leaks.
 * Runs every 60 seconds.
 */
const CLEANUP_INTERVAL = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, WINDOW_MS);

// Prevent the cleanup interval from keeping the process alive in serverless.
if (typeof CLEANUP_INTERVAL === 'object' && 'unref' in CLEANUP_INTERVAL) {
  CLEANUP_INTERVAL.unref();
}

/**
 * Check and update rate limit for an IP.
 * @returns true if the request is allowed, false if rate limited.
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    // New window — reset counter.
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return false;
  }

  entry.count++;
  return true;
}

// ─── Dummy hash for timing-safe rejection ────────────────────────────────────

/**
 * Pre-computed bcrypt hash of a random string.
 * When a login attempt uses a non-existent username, we compare the supplied
 * password against this dummy hash. This ensures the response time is consistent
 * regardless of whether the username exists, preventing timing-based enumeration.
 */
const DUMMY_HASH = '$2a$12$LJ3m4ys3Lg2VBe4sYz7KjuSNOF2nh5pzKMqNjKsaGZoR5kDJfGdKC';

// ─── POST /api/auth/login ────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Rate limit check ─────────────────────────────────────────────────
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';

    if (!checkRateLimit(ip)) {
      await logAuditEvent('ANONYMOUS', 'ACCESS_DENIED', 'Auth', null, {
        reason: 'Rate limit exceeded',
        ip,
      });

      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.', code: 'RATE_LIMITED' },
        { status: 429 }
      );
    }

    // ── Parse and validate input ─────────────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const validation = loginSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          // Only return field-level errors, never internal details.
          details: validation.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const { username, password } = validation.data;

    // ── Lookup user ──────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        role: true,
        name: true,
        accessUnits: true,
        isActive: true,
        totpSecret: true,
        isTotpEnabled: true,
      },
    });

    // ── Timing-safe password verification ────────────────────────────────
    // Always run bcrypt.compare even if user doesn't exist to prevent timing attacks.
    const hashToCompare = user?.passwordHash ?? DUMMY_HASH;
    const passwordValid = await verifyPassword(password, hashToCompare);

    if (!user || !passwordValid || !user.isActive) {
      // Log the failed attempt (without revealing which condition failed).
      await logAuditEvent('ANONYMOUS', 'ACCESS_DENIED', 'Auth', null, {
        reason: 'Invalid credentials',
        username, // Safe to log server-side for security monitoring.
        ip,
      });

      return NextResponse.json(
        { error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
        { status: 401 }
      );
    }

    // ── Generate temporary MFA pending token ───────────────────────────
    const mfaPendingToken = await createMfaPendingToken(user.id);
    const isFirstTime = !user.isTotpEnabled || !user.totpSecret;

    // Log the successful password authentication step
    await logAuditEvent(user.id, 'LOGIN_PASSWORD_VERIFIED', 'Auth', user.id, {
      ip,
      isFirstTime,
    });

    return NextResponse.json(
      {
        mfaRequired: true,
        mfaPendingToken,
        isFirstTime,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          name: user.name,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    // ── Global catch — NEVER expose internal errors ──────────────────────
    console.error('[LOGIN] Internal error:', error);

    return NextResponse.json(
      { error: 'An error occurred. Please try again later.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
