/**
 * @module api/transport/assign
 * @description Assign / change a student's transport mode and sync their Transport Fee allocation.
 *
 * POST — body: { studentId, transportMode: 'OWN_VEHICLE'|'BUS_SERVICE', busStationId? }
 *        Updates the student record and creates/updates/removes the Transport Fee allocation
 *        via the shared lib/transport helper.
 *
 * SECURITY: RBAC — student's unit must be in the user's access units.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { applyStudentTransport } from '@/lib/transport';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const assignSchema = z.object({
  studentId: z.string().regex(UUID_REGEX, 'Invalid student ID'),
  transportMode: z.enum(['OWN_VEHICLE', 'BUS_SERVICE']),
  busStationId: z.string().regex(UUID_REGEX, 'Invalid station ID').optional().nullable(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const accessUnitsRaw = request.headers.get('x-user-access-units');
    if (!userId || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 }); }

    const validation = assignSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed', code: 'VALIDATION_ERROR',
        details: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }

    const { studentId, transportMode, busStationId } = validation.data;

    if (transportMode === 'BUS_SERVICE' && !busStationId) {
      return NextResponse.json({ error: 'A station must be selected for bus service.', code: 'MISSING_STATION' }, { status: 400 });
    }

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return NextResponse.json({ error: 'Student not found', code: 'NOT_FOUND' }, { status: 404 });
    if (!accessUnits.includes(student.unitId)) {
      return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
    }

    const result = await applyStudentTransport({
      studentId,
      unitId: student.unitId,
      className: student.className,
      admissionDate: student.admissionDate,
      transportMode,
      busStationId: busStationId ?? null,
    });

    await logAuditEvent(userId, 'UPDATE', 'Student', studentId, {
      action: 'TRANSPORT_ASSIGN',
      transportMode: result.transportMode,
      station: result.stationName,
      annualFee: result.annualFee,
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error('[TRANSPORT_ASSIGN]', error);
    const message = error instanceof Error ? error.message : 'Failed to assign transport.';
    return NextResponse.json({ error: message, code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
