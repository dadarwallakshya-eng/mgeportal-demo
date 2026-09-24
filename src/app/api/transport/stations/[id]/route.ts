/**
 * @module api/transport/stations/[id]
 * @description Edit a station's fares / toggle active state (DIRECTOR only).
 *
 * Note: editing a station's fare does NOT retroactively change existing students' allocations —
 * it only affects future assignments. (Re-assigning a student picks up the new fare.)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAuditEvent } from '@/lib/audit';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid ID', code: 'INVALID_ID' }, { status: 400 });

    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');
    if (!userId) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    if (userRole !== 'DIRECTOR') return NextResponse.json({ error: 'Director access required', code: 'FORBIDDEN' }, { status: 403 });

    const existing = await prisma.busStation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Station not found', code: 'NOT_FOUND' }, { status: 404 });

    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const updated = await prisma.busStation.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        perMonth: body.perMonth !== undefined ? Number(body.perMonth) : existing.perMonth,
        perYear: body.perYear !== undefined ? Number(body.perYear) : existing.perYear,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : existing.isActive,
      },
    });

    await logAuditEvent(userId, 'UPDATE', 'BusStation', id, {
      stationNo: existing.stationNo,
      changes: { perMonth: body.perMonth, perYear: body.perYear, isActive: body.isActive },
    });
    return NextResponse.json({ station: updated });
  } catch (error) {
    console.error('[STATION_PATCH]', error);
    return NextResponse.json({ error: 'Failed to update station.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
