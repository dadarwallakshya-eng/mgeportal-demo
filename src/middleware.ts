/**
 * @module middleware
 * @description Next.js Edge Middleware for route protection.
 *
 * SECURITY DECISIONS:
 * - Uses jose (not jsonwebtoken) because this runs in Edge Runtime, which does
 *   not have Node.js built-in `crypto` module available.
 * - Protected routes: all /dashboard/* and /api/* EXCEPT /api/auth/login.
 * - On auth failure:
 *   - Page routes → 302 redirect to /login (preserves the original URL as ?from= for post-login redirect).
 *   - API routes → 401 JSON response with generic error message.
 * - User identity is forwarded to downstream handlers via request headers:
 *   x-user-id, x-user-role, x-user-name, x-user-username, x-user-access-units.
 *   This avoids redundant token verification in every API route handler.
 *
 * IMPORTANT: Request headers set in middleware are TRUSTED — they can only be set
 * by this middleware (browsers cannot set x-user-* headers that survive to the server).
 * However, the middleware itself MUST run to set them; handlers should never trust
 * these headers without middleware being in the matcher config.
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, type JWTPayload } from 'jose';
import { applySecurityHeaders } from '@/lib/security-headers';

/** Must match the secret in src/lib/auth.ts. */
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'demo-jwt-secret-key-razorpay-builder-2026'
);

/** Cookie name — must match src/lib/session.ts. */
const SESSION_COOKIE = 'mge-session';
const GATEWAY_COOKIE = 'mge-gateway-session';

/**
 * JWT payload shape — duplicated here because middleware runs in Edge Runtime
 * and cannot import from files that pull in Node.js-only dependencies (bcryptjs).
 */
interface UserPayload extends JWTPayload {
  jti: string;
  userId: string;
  username: string;
  role: string;
  accessUnits: string[];
  name: string;
  fingerprint?: string;
}

/**
 * Computes a SHA-256 fingerprint from user agent and IP address in the Edge runtime.
 */
async function computeFingerprintEdge(userAgent: string | null, ip: string | null): Promise<string> {
  const cleanUa = userAgent || 'no-ua';
  const cleanIp = (ip || 'no-ip').split(',')[0].trim();
  const rawString = `${cleanUa}|${cleanIp}`;
  const msgUint8 = new TextEncoder().encode(rawString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a JWT token within Edge Runtime.
 * Returns the payload if valid, null otherwise.
 */
async function verifyTokenEdge(token: string): Promise<UserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'mge-portal',
    });
    return payload as UserPayload;
  } catch {
    return null;
  }
}

async function verifyGatewayTokenEdge(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'mge-gateway',
    });
    return !!payload.whitelisted;
  } catch {
    return false;
  }
}

/**
 * Check if the current path is an API route.
 */
function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

/**
 * Create a 401 JSON response for API routes.
 * Uses a generic message to avoid information leakage.
 */
function unauthorizedApiResponse(message = 'Authentication required'): NextResponse {
  return NextResponse.json(
    { error: message, code: 'UNAUTHORIZED' },
    { status: 401 }
  );
}

/**
 * Create a 429 JSON response for API routes when rate limited.
 */
function rateLimitResponse(message = 'Too many requests. Please try again later.'): NextResponse {
  return NextResponse.json(
    { error: message, code: 'RATE_LIMITED' },
    { status: 429 }
  );
}

interface IpRateLimit {
  count: number;
  resetAt: number;
}

const ipLimits = new Map<string, IpRateLimit>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_API_REQ_PER_MIN = 120; // 120 write/upload requests per minute per IP

/**
 * Create a redirect response to the login page for page routes.
 * Preserves the original URL so the login page can redirect back after auth.
 */
function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('from', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

function redirectToGoogleLogin(request: NextRequest): NextResponse {
  const googleLoginUrl = new URL('/api/auth/google/login', request.url);
  return NextResponse.redirect(googleLoginUrl);
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ── Rate Limiting for non-GET API routes ────────────────────────────────
  if (isApiRoute(pathname) && request.method !== 'GET' && pathname !== '/api/health') {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.ip || 'unknown';
    const now = Date.now();
    const entry = ipLimits.get(ip);

    if (!entry || now > entry.resetAt) {
      ipLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    } else {
      if (entry.count >= MAX_API_REQ_PER_MIN) {
        console.warn(`[SECURITY_RATE_LIMIT] API Rate Limit Exceeded for IP: ${ip} on: ${pathname}`);
        return applySecurityHeaders(rateLimitResponse());
      }
      entry.count++;
    }
  }

  // ── Allow public auth & demo endpoints ─────────────────────────────────
  if (
    pathname === '/login' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/demo-login' ||
    pathname === '/api/auth/logout' ||
    pathname === '/api/health' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/api/auth/google/login' ||
    pathname === '/api/auth/google/callback' ||
    pathname === '/api/auth/mfa/setup' ||
    pathname === '/api/auth/mfa/verify' ||
    pathname === '/api/auth/mfa/reset' ||
    pathname === '/api/auth/mfa/send-reset-otp' ||
    pathname === '/api/auth/mfa/verify-reset-otp' ||
    pathname === '/api/auth/session-check'
  ) {
    return applySecurityHeaders(NextResponse.next());
  }

  // ── Allow Vercel cron endpoints ────────────────────────────────────────
  // /api/cron/* routes do their OWN auth via a shared CRON_SECRET that Vercel
  // includes as `Authorization: Bearer <secret>`.
  if (pathname.startsWith('/api/cron/')) {
    return applySecurityHeaders(NextResponse.next());
  }

  // ── LAYER 2: Main Session Check ─────────────────────────────────────────
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    const response = isApiRoute(pathname)
      ? unauthorizedApiResponse()
      : redirectToLogin(request);
    return applySecurityHeaders(response);
  }

  // ── Verify main token ───────────────────────────────────────────────────
  const user = await verifyTokenEdge(token);

  if (user && user.fingerprint) {
    const currentFp = await computeFingerprintEdge(
      request.headers.get('user-agent'),
      request.headers.get('x-forwarded-for') || request.ip || 'unknown'
    );
    if (user.fingerprint !== currentFp) {
      console.warn(`[SECURITY] Session fingerprint mismatch for user: ${user.username}. Access denied.`);
      const response = isApiRoute(pathname)
        ? unauthorizedApiResponse('Session fingerprint mismatch. Access denied.')
        : redirectToLogin(request);

      response.cookies.set(SESSION_COOKIE, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/',
        maxAge: 0,
      });

      return applySecurityHeaders(response);
    }
  }

  if (!user) {
    // Token exists but is invalid/expired — clear it and deny access.
    const response = isApiRoute(pathname)
      ? unauthorizedApiResponse()
      : redirectToLogin(request);

    // Clear the stale cookie so the user isn't stuck in a redirect loop.
    response.cookies.set(SESSION_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
      maxAge: 0,
    });

    return applySecurityHeaders(response);
  }

  // ── Verify session blacklist (only on write/mutation API requests to eliminate 3.4s page load latency) ──
  if (isApiRoute(pathname) && request.method !== 'GET') {
    try {
      const checkUrl = new URL('/api/auth/session-check', request.url);
      checkUrl.searchParams.set('jti', user.jti);

      const checkRes = await fetch(checkUrl.toString(), {
        headers: {
          'x-session-check-internal': 'true',
        },
      });

      if (checkRes.status === 401) {
        console.warn(`[MIDDLEWARE] Revoked session access attempt detected for JTI: ${user.jti}`);
        const response = unauthorizedApiResponse('Session has been revoked');

        response.cookies.set(SESSION_COOKIE, '', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
          path: '/',
          maxAge: 0,
        });

        return applySecurityHeaders(response);
      }
    } catch (err) {
      console.error('[MIDDLEWARE] Token blacklist validation error:', err);
    }
  }

  // ── Forward user identity via request headers ──────────────────────────
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', user.userId);
  requestHeaders.set('x-user-role', user.role);
  requestHeaders.set('x-user-name', user.name);
  requestHeaders.set('x-user-username', user.username);
  requestHeaders.set('x-user-access-units', JSON.stringify(user.accessUnits));

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/:path*',
    '/login',
  ],
};

