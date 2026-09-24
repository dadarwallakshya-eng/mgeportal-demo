/**
 * @module api/transport/stations
 * @description Bus stations (pickup stops) with monthly/annual fares.
 *
 * GET  — List all stations (any authenticated user — needed for the student registration dropdown).
 *        Includes a count of students assigned to each station.
 * POST — Create a new station (DIRECTOR only).
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';

const createStationSchema = z.object({
  stationNo: z.preprocess(Number, z.number().int().positive('Station number must be positive')),
  name: z.string().min(1, 'Station name required').max(150).trim(),
  perMonth: z.preprocess(Number, z.number().min(0, 'Fare cannot be negative')),
  perYear: z.preprocess(Number, z.number().min(0, 'Fare cannot be negative')),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const stations = await prisma.busStation.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { stationNo: 'asc' },
      include: { _count: { select: { students: true } } },
    });

    return NextResponse.json({ stations });
  } catch (error) {
    console.error('[STATIONS_GET]', error);
    return NextResponse.json({ error: 'Failed to load stations.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');
    if (!userId) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    if (userRole !== 'DIRECTOR') return NextResponse.json({ error: 'Director access required', code: 'FORBIDDEN' }, { status: 403 });

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 }); }

    const validation = createStationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed', code: 'VALIDATION_ERROR',
        details: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }

    const d = validation.data;
    const existing = await prisma.busStation.findUnique({ where: { stationNo: d.stationNo } });
    if (existing) {
      return NextResponse.json({ error: `Station number ${d.stationNo} already exists.`, code: 'DUPLICATE_RECORD' }, { status: 409 });
    }

    const station = await prisma.busStation.create({
      data: { stationNo: d.stationNo, name: d.name, perMonth: d.perMonth, perYear: d.perYear, isActive: true },
    });

    await logAuditEvent(userId, 'CREATE', 'BusStation', station.id, { stationNo: d.stationNo, name: d.name });
    return NextResponse.json({ station }, { status: 201 });
  } catch (error) {
    console.error('[STATIONS_POST]', error);
    return NextResponse.json({ error: 'Failed to create station.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
