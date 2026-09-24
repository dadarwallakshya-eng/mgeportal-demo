/**
 * @module session
 * @description Cookie-based session management for the MGE Portal.
 *
 * SECURITY DECISIONS:
 * - HttpOnly: Prevents JavaScript access to the session cookie, mitigating XSS token theft.
 * - Secure: Cookie is only sent over HTTPS in production, preventing interception.
 * - SameSite=Strict: Prevents the cookie from being sent in cross-site requests,
 *   mitigating CSRF attacks.
 * - Path=/: Cookie is available across all routes.
 * - MaxAge=3600: Matches the 1-hour JWT expiry to avoid stale sessions.
 *
 * Two APIs are provided:
 * 1. Response-based (setSession/clearSession): For use in API Route Handlers
 *    where you construct a NextResponse.
 * 2. Server Component-based (getSession): Uses next/headers cookies() for
 *    reading the session in Server Components, Server Actions, and Route Handlers.
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyToken, type UserPayload } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** Cookie name. Prefixed for clarity; short to save header bytes. */
const SESSION_COOKIE = 'mge-session';

/** Session duration in seconds — must match JWT TOKEN_EXPIRY. */
const MAX_AGE = 3600; // 1 hour

/** Whether the app is running in production (Secure flag depends on this). */
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Set the session cookie on an outgoing response.
 *
 * @param response - The NextResponse to attach the cookie to.
 * @param token - The signed JWT string.
 * @returns The same response object (for chaining).
 *
 * @security
 * - HttpOnly prevents client-side JS from reading the token.
 * - Secure ensures the cookie is only sent over TLS in production.
 * - SameSite=Strict prevents the browser from sending the cookie on cross-origin requests.
 */
export function setSession(response: NextResponse, token: string): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
  return response;
}

/**
 * Read and verify the session cookie from an incoming request.
 * Works in Server Components, Server Actions, and Route Handlers via next/headers.
 *
 * @returns The verified UserPayload if the session is valid, or `null` if
 *          the cookie is missing, expired, or tampered with.
 *
 * @security Returns null for ANY invalid state — callers must not distinguish
 * between "no cookie" and "bad cookie" to prevent enumeration attacks.
 */
export async function getSession(): Promise<UserPayload | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE);

    if (!sessionCookie?.value) {
      return null;
    }

    const payload = await verifyToken(sessionCookie.value);
    if (!payload) {
      return null;
    }

    // Check if the token has been blacklisted (wrapped safely so DB hiccups never invalidate session)
    try {
      const blacklisted = await prisma.sessionBlacklist.findUnique({
        where: { jti: payload.jti },
      });
      if (blacklisted) {
        return null;
      }
    } catch (dbErr) {
      console.warn('[SESSION_BLACKLIST_CHECK_WARN] DB check warning, proceeding with valid JWT:', dbErr);
    }

    return payload;
  } catch {
    // Cookie read failures (e.g., called outside request context) → unauthenticated.
    return null;
  }
}

/**
 * Clear the session cookie on an outgoing response (logout) and blacklist the token's JTI.
 *
 * @param response - The NextResponse to clear the cookie on.
 * @param token - The optional active JWT session token to blacklist.
 * @returns The same response object (for chaining).
 *
 * @security Sets maxAge=0 and an empty value to ensure the browser deletes the cookie
 * immediately. Retains HttpOnly/Secure/SameSite to match the original Set-Cookie
 * attributes (required by browsers for proper deletion). Inserts the token's JTI
 * into the database session blacklist so it cannot be replayed.
 */
export async function clearSession(response: NextResponse, token?: string | null): Promise<NextResponse> {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? 'strict' : 'lax',
    path: '/',
    maxAge: 0,
  });

  if (token) {
    try {
      const payload = await verifyToken(token);
      if (payload && payload.jti && payload.exp) {
        await prisma.sessionBlacklist.upsert({
          where: { jti: payload.jti },
          update: {},
          create: {
            jti: payload.jti,
            expiresAt: new Date(payload.exp * 1000),
          },
        });
      }
    } catch (err) {
      console.error('[SESSION] Failed to blacklist session token:', err);
    }
  }

  return response;
}
