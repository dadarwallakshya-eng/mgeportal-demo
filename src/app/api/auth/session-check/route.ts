/**
 * @module api/auth/session-check
 * @description API route to check if a token JTI is blacklisted.
 *
 * Edge Middleware cannot query PostgreSQL databases directly due to runtime constraints.
 * This route runs in the standard Node.js runtime and serves as an bridge.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const jti = searchParams.get('jti');

    if (!jti) {
      return NextResponse.json(
        { error: 'jti parameter is required', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    const revoked = await prisma.sessionBlacklist.findUnique({
      where: { jti },
    });

    if (revoked) {
      return NextResponse.json(
        { error: 'Session has been revoked', code: 'REVOKED' },
        { status: 401 }
      );
    }

    return NextResponse.json({ status: 'active' }, { status: 200 });
  } catch (error) {
    console.error('[SESSION-CHECK] Database error during verification:', error);
    // In case of db failures, return 500 to prevent potential session bypasses
    return NextResponse.json(
      { error: 'Internal verification failure', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
