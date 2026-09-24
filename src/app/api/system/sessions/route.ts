import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');

    if (!userId || !userRole) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    if (userRole !== 'DIRECTOR') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const threshold = new Date(Date.now() - 180 * 1000); // 3 minutes inactivity threshold

    // Fetch active sessions
    const activeSessions = await prisma.userSession.findMany({
      where: {
        lastActive: { gte: threshold },
        logoutAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
            photoUrl: true,
          },
        },
      },
      orderBy: { lastActive: 'desc' },
    });

    if (activeOnly) {
      return NextResponse.json({ activeSessions });
    }

    // Fetch completed sessions
    const completedSessions = await prisma.userSession.findMany({
      where: {
        OR: [
          { logoutAt: { not: null } },
          { lastActive: { lt: threshold } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
            photoUrl: true,
          },
        },
      },
      orderBy: { loginAt: 'desc' },
      take: 5000,
    });

    // Fetch recent user activities
    const activities = await prisma.userActivity.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
            photoUrl: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 5000,
    });

    return NextResponse.json({
      activeSessions,
      completedSessions,
      activities,
    });
  } catch (error) {
    console.error('[SYSTEM_SESSIONS_GET]', error);
    return NextResponse.json({ error: 'Internal Error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
