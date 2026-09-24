/**
 * @module security-headers
 * @description Utility to apply defense-in-depth HTTP security headers.
 *
 * SECURITY DECISIONS:
 *
 * Content-Security-Policy (CSP):
 *   - default-src 'self': Only allow resources from the same origin by default.
 *   - script-src 'self': Block inline scripts (XSS mitigation). 'unsafe-inline' is
 *     intentionally NOT included. If Next.js requires nonces, update this with a
 *     per-request nonce strategy.
 *   - style-src 'self' 'unsafe-inline': Inline styles are allowed because Tailwind CSS
 *     and many UI libraries inject them. This is a pragmatic trade-off.
 *   - img-src 'self' data: blob:: Allows inline images (data URIs) and blob URLs for
 *     client-side image previews (e.g., student photos).
 *   - font-src 'self': Fonts from same origin only.
 *   - connect-src 'self': API calls to same origin only.
 *   - frame-ancestors 'none': Equivalent to X-Frame-Options: DENY; prevents clickjacking.
 *   - form-action 'self': Forms can only submit to same origin.
 *   - base-uri 'self': Prevents base tag injection attacks.
 *   - object-src 'none': Blocks Flash/Java plugins entirely.
 *
 * X-Content-Type-Options: nosniff
 *   Prevents browsers from MIME-sniffing responses away from the declared Content-Type.
 *
 * X-Frame-Options: DENY
 *   Legacy clickjacking protection (redundant with CSP frame-ancestors but kept for
 *   older browsers).
 *
 * X-XSS-Protection: 1; mode=block
 *   Legacy XSS filter (deprecated in modern browsers but harmless to include for IE11).
 *
 * Referrer-Policy: strict-origin-when-cross-origin
 *   Sends the full URL as referrer for same-origin requests, but only the origin for
 *   cross-origin requests. Prevents leaking URL paths to external sites.
 *
 * Permissions-Policy:
 *   Explicitly disables camera, microphone, and geolocation — a school portal has
 *   no need for these APIs.
 *
 * Strict-Transport-Security (HSTS):
 *   Production only. Tells browsers to always use HTTPS for 1 year, including subdomains.
 *   `preload` is included so the domain can be submitted to the HSTS preload list.
 */

import { NextResponse } from 'next/server';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/** Security headers to apply to every response. */
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.r2.cloudflarestorage.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self'",
    "frame-src 'self' https://*.r2.cloudflarestorage.com",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/** HSTS header — only applied in production to avoid breaking local HTTP dev servers. */
const HSTS_HEADER = 'max-age=31536000; includeSubDomains; preload';

/**
 * Apply security headers to a NextResponse.
 *
 * @param response - The response to add headers to.
 * @returns The same response object with security headers set (for chaining).
 *
 * @example
 * ```ts
 * import { applySecurityHeaders } from '@/lib/security-headers';
 *
 * export function middleware(request: NextRequest) {
 *   const response = NextResponse.next();
 *   return applySecurityHeaders(response);
 * }
 * ```
 */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(header, value);
  }

  if (IS_PRODUCTION) {
    response.headers.set('Strict-Transport-Security', HSTS_HEADER);
  }

  return response;
}
