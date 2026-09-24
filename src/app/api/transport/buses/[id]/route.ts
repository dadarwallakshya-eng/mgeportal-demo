/**
 * @module api/transport/buses/[id]
 * @description Edit or delete a specific bus in the fleet (DIRECTOR / PRINCIPAL / DEPARTMENT_HEAD).
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { BusStatus } from '@prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const updateBusSchema = z.object({
  busNo: z.string().min(1, 'Bus number required').max(30).trim().optional(),
  route: z.string().min(1, 'Route required').max(300).trim().optional(),
  driverId: z.string().regex(UUID_REGEX, 'Valid driver required').optional(),
  seatingCapacity: z.preprocess(Number, z.number().int().positive('Capacity must be positive')).optional(),
  status: z.enum(['ACTIVE', 'MAINTENANCE']).optional(),
  registrationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().or(z.literal('').or(z.null())),
  fitnessExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().or(z.literal('').or(z.null())),
  taxExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().or(z.literal('').or(z.null())),
  insuranceExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().or(z.literal('').or(z.null())),
  puccExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().or(z.literal('').or(z.null())),
  permitExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().or(z.literal('').or(z.null())),
});

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
    if (!['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'].includes(userRole || '')) {
      return NextResponse.json({ error: 'Insufficient permissions', code: 'FORBIDDEN' }, { status: 403 });
    }

    const existing = await prisma.bus.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Bus not found', code: 'NOT_FOUND' }, { status: 404 });

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const validation = updateBusSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed', code: 'VALIDATION_ERROR',
        details: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }

    const d = validation.data;

    // Check driver if changing
    if (d.driverId) {
      const driver = await prisma.staff.findUnique({ where: { id: d.driverId } });
      if (!driver || driver.staffType !== 'DRIVER') {
        return NextResponse.json({ error: 'Assigned staff must be a registered Driver.', code: 'INVALID_DRIVER' }, { status: 400 });
      }
    }

    // Check unique busNo if changing
    if (d.busNo && d.busNo !== existing.busNo) {
      const duplicate = await prisma.bus.findUnique({ where: { busNo: d.busNo } });
      if (duplicate) {
        return NextResponse.json({ error: `Bus number '${d.busNo}' already exists.`, code: 'DUPLICATE_RECORD' }, { status: 409 });
      }
    }

    const parseDate = (val?: string | null) => {
      if (val === undefined) return undefined;
      if (val === null || val === '') return null;
      return new Date(val);
    };

    const updated = await prisma.bus.update({
      where: { id },
      data: {
        busNo: d.busNo ?? existing.busNo,
        route: d.route ?? existing.route,
        driverId: d.driverId ?? existing.driverId,
        seatingCapacity: d.seatingCapacity !== undefined ? d.seatingCapacity : existing.seatingCapacity,
        status: d.status ?? existing.status,
        registrationDate: parseDate(d.registrationDate) ?? existing.registrationDate,
        fitnessExpiry: parseDate(d.fitnessExpiry) ?? existing.fitnessExpiry,
        taxExpiry: parseDate(d.taxExpiry) ?? existing.taxExpiry,
        insuranceExpiry: parseDate(d.insuranceExpiry) ?? existing.insuranceExpiry,
        puccExpiry: parseDate(d.puccExpiry) ?? existing.puccExpiry,
        permitExpiry: parseDate(d.permitExpiry) ?? existing.permitExpiry,
      },
      include: { driver: { select: { id: true, name: true, phone: true } } },
    });

    await logAuditEvent(userId, 'UPDATE', 'Bus', id, {
      busNo: existing.busNo,
      changes: d,
    });

    return NextResponse.json({ bus: updated });
  } catch (error) {
    console.error('[BUS_PATCH]', error);
    return NextResponse.json({ error: 'Failed to update bus.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid ID', code: 'INVALID_ID' }, { status: 400 });

    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');
    if (!userId) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    if (!['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'].includes(userRole || '')) {
      return NextResponse.json({ error: 'Insufficient permissions', code: 'FORBIDDEN' }, { status: 403 });
    }

    const existing = await prisma.bus.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Bus not found', code: 'NOT_FOUND' }, { status: 404 });

    await prisma.bus.delete({ where: { id } });

    await logAuditEvent(userId, 'DELETE', 'Bus', id, { busNo: existing.busNo });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[BUS_DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete bus.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
