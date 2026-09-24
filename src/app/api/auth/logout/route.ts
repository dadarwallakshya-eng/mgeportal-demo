/**
 * @module api/auth/logout
 * @description Logout API route — clears the session cookie.
 *
 * SECURITY DECISIONS:
 * - POST only: Logout is a state-changing operation; GET would be vulnerable to
 *   CSRF via <img src="/api/auth/logout">.
 * - Clears the session cookie with matching attributes (HttpOnly, Secure, SameSite, Path)
 *   to ensure the browser correctly removes it.
 * - No body processing — logout needs no input.
 */

import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/session';
import { logAuditEvent } from '@/lib/audit';
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Extract user ID from middleware-injected header for audit logging.
    const userId = request.headers.get('x-user-id') || 'ANONYMOUS';

    const response = NextResponse.json(
      { message: 'Logged out successfully' },
      { status: 200 }
    );

    const token = request.cookies.get('mge-session')?.value;
    await clearSession(response, token);

    await logAuditEvent(userId, 'LOGOUT', 'Auth', userId !== 'ANONYMOUS' ? userId : null, undefined);

    return response;
  } catch (error) {
    console.error('[LOGOUT] Internal error:', error);

    return NextResponse.json(
      { error: 'An error occurred. Please try again later.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
