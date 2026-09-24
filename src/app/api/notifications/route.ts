/**
 * @file src/app/api/notifications/route.ts
 * @description API endpoint to fetch and update notifications.
 *              GET   — Fetch recent notifications + unread count.
 *              PATCH — Mark a specific notification or all notifications as read.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error('[NOTIFICATIONS_GET] Internal error:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    let body: { id?: string; readAll?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is acceptable if marking all as read
    }

    if (body.id) {
      // Mark specific notification as read
      await prisma.notification.updateMany({
        where: { id: body.id, userId },
        data: { isRead: true },
      });
    } else {
      // Mark all notifications as read for this user
      await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[NOTIFICATIONS_PATCH] Internal error:', error);
    return NextResponse.json({ error: 'Failed to update notifications', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
