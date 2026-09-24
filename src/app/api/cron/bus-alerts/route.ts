/**
 * @file src/app/api/cron/bus-alerts/route.ts
 * @description Vercel-cron-triggered daily endpoint to notify directors and transport HODs
 *              10 days and 3 days prior to the expiration of any bus validity doc (Fitness, Tax, Insurance, PUCC, Permit).
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { notificationEmitter } from '@/lib/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getCalendarDifference(expiry: Date, today: Date): number {
  const dExp = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
  const dToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffTime = dExp.getTime() - dToday.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: 'CRON_SECRET is not configured on the server. Refusing to run.', code: 'NO_SECRET' },
        { status: 503 }
      );
    }
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const today = new Date();
    // Fetch all buses with any RTO date set
    const buses = await prisma.bus.findMany({
      where: {
        OR: [
          { fitnessExpiry: { not: null } },
          { taxExpiry: { not: null } },
          { insuranceExpiry: { not: null } },
          { puccExpiry: { not: null } },
          { permitExpiry: { not: null } },
        ],
      },
    });

    const alerts: { busNo: string; docType: string; daysLeft: number; expiryDate: string }[] = [];

    const RTO_FIELDS = [
      { name: 'Fitness Validity', key: 'fitnessExpiry' },
      { name: 'Tax Validity', key: 'taxExpiry' },
      { name: 'Insurance Validity', key: 'insuranceExpiry' },
      { name: 'PUCC Validity', key: 'puccExpiry' },
      { name: 'Permit Validity', key: 'permitExpiry' },
    ] as const;

    for (const bus of buses) {
      for (const field of RTO_FIELDS) {
        const val = bus[field.key];
        if (val) {
          const diff = getCalendarDifference(val, today);
          if (diff === 10 || diff === 3) {
            const formattedDate = val.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            alerts.push({
              busNo: bus.busNo,
              docType: field.name,
              daysLeft: diff,
              expiryDate: formattedDate,
            });
          }
        }
      }
    }

    if (alerts.length === 0) {
      return NextResponse.json({ ok: true, message: 'No expirations found for 10-day or 3-day warning windows.', alertsTriggered: 0 });
    }

    // Get all Directors and Transport Staff to notify
    const targetUsers = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'DIRECTOR' },
          { accessUnits: { has: 'transport' } },
        ],
        isActive: true,
      },
      select: { id: true },
    });

    let notificationsCreated = 0;

    for (const alert of alerts) {
      const title = `${alert.docType} Alert: ${alert.busNo}`;
      const message = `Bus ${alert.busNo} ${alert.docType} is expiring in ${alert.daysLeft} days on ${alert.expiryDate}.`;

      for (const user of targetUsers) {
        const notification = await prisma.notification.create({
          data: {
            userId: user.id,
            title,
            message,
          },
        });

        // Emit SSE live alert
        notificationEmitter.emit('notification', {
          userId: user.id,
          notification,
        });

        notificationsCreated++;
      }
    }

    return NextResponse.json({
      ok: true,
      alertsTriggered: alerts.length,
      notificationsSent: notificationsCreated,
      alerts,
    });
  } catch (error) {
    console.error('[BUS_ALERTS_CRON]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
