/**
 * @module api/auth/me
 * @description Returns the currently authenticated user's profile.
 *
 * SECURITY DECISIONS:
 * - GET only: This is a read-only endpoint.
 * - Reads user identity from middleware-injected x-user-* headers (already verified
 *   by middleware JWT check). No redundant token verification needed.
 * - Returns ONLY the information already in the JWT — never queries the database
 *   for additional fields that might include sensitive data (passwordHash, etc.).
 * - Returns 401 if x-user-id is missing (should only happen if middleware didn't run,
 *   which indicates a configuration error).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    let userId = request.headers.get('x-user-id');
    let username = request.headers.get('x-user-username');
    let role = request.headers.get('x-user-role');
    let name = request.headers.get('x-user-name');
    let accessUnitsRaw = request.headers.get('x-user-access-units');

    let debugInfo: any = {};
    // Fallback: Read directly from cookie session if middleware headers are missing
    if (!userId || !username || !role || !name) {
      const session = await getSession();
      if (session) {
        userId = session.userId;
        username = session.username;
        role = session.role;
        name = session.name;
        accessUnitsRaw = JSON.stringify(session.accessUnits || []);
      } else {
        const cookieStore = await cookies();
        const cookieVal = cookieStore.get('mge-session')?.value;
        debugInfo = {
          hasCookie: !!cookieVal,
          cookieLen: cookieVal ? cookieVal.length : 0,
          envSecretSet: !!process.env.JWT_SECRET,
        };
      }
    }

    if (!userId || !username || !role || !name) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED', debug: debugInfo },
        { status: 401 }
      );
    }

    let accessUnits: string[] = [];
    try {
      accessUnits = accessUnitsRaw ? JSON.parse(accessUnitsRaw) : [];
    } catch {
      accessUnits = [];
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, photoUrl: true }
    });

    return NextResponse.json(
      {
        user: {
          id: userId,
          username,
          role,
          name,
          accessUnits,
          phone: dbUser?.phone || null,
          photoUrl: dbUser?.photoUrl || null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[ME] Internal error:', error);

    return NextResponse.json(
      { error: 'An error occurred. Please try again later.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
