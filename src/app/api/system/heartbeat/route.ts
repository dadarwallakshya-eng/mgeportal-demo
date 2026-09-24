import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    let body: { sessionId: string; activePath: string; isClose?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 });
    }

    const { sessionId, activePath, isClose } = body;
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Upsert the session record
    const session = await prisma.userSession.upsert({
      where: { id: sessionId },
      update: {
        lastActive: new Date(),
        activePath,
        logoutAt: isClose ? new Date() : null,
      },
      create: {
        id: sessionId,
        userId,
        activePath,
        ip,
        userAgent,
        loginAt: new Date(),
        lastActive: new Date(),
      },
    });

    return NextResponse.json({ session });
  } catch (error) {
    console.error('[SYSTEM_HEARTBEAT_POST]', error);
    return NextResponse.json({ error: 'Internal Error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
