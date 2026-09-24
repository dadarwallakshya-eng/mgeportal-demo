import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function checkAuth(request: NextRequest) {
  const role = request.headers.get('x-user-role');
  const userId = request.headers.get('x-user-id');
  if (!userId || role !== 'DIRECTOR') {
    return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  try {
    if (!checkAuth(request)) {
      return NextResponse.json({ error: 'Access denied. Director role required.', code: 'FORBIDDEN' }, { status: 403 });
    }

    const alerts = await prisma.systemAlert.findMany({
      where: { isResolved: false },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ alerts });
  } catch (error: any) {
    console.error('[SYSTEM_ALERTS_GET]', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch alerts', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!checkAuth(request)) {
      return NextResponse.json({ error: 'Access denied. Director role required.', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await request.json();

    if (body.resolveAll) {
      await prisma.systemAlert.updateMany({
        where: { isResolved: false },
        data: { isResolved: true }
      });
      return NextResponse.json({ success: true });
    }

    const { alertId } = body;
    if (!alertId) {
      return NextResponse.json({ error: 'Alert ID required', code: 'BAD_REQUEST' }, { status: 400 });
    }

    const updated = await prisma.systemAlert.update({
      where: { id: alertId },
      data: { isResolved: true }
    });

    return NextResponse.json({ success: true, alert: updated });
  } catch (error: any) {
    console.error('[SYSTEM_ALERTS_PATCH]', error);
    return NextResponse.json({ error: error.message || 'Failed to resolve alert', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
