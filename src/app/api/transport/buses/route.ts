/**
 * @module api/transport/buses
 * @description Bus fleet — list and add buses, each assigned to a driver (Staff with staffType DRIVER).
 *
 * GET  — All buses with driver name + status.
 * POST — Add a bus (DIRECTOR / PRINCIPAL). driverId must reference an ACTIVE DRIVER staff member.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { BusStatus } from '@prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createBusSchema = z.object({
  busNo: z.string().min(1, 'Bus number required').max(30).trim(),
  route: z.string().min(1, 'Route required').max(300).trim(),
  driverId: z.string().regex(UUID_REGEX, 'Valid driver required'),
  seatingCapacity: z.preprocess(Number, z.number().int().positive('Capacity must be positive')),
  registrationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().or(z.literal('')),
  fitnessExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().or(z.literal('')),
  taxExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().or(z.literal('')),
  insuranceExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().or(z.literal('')),
  puccExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().or(z.literal('')),
  permitExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().or(z.literal('')),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });

    const buses = await prisma.bus.findMany({
      orderBy: { busNo: 'asc' },
      include: { driver: { select: { id: true, name: true, phone: true, licenseNo: true } } },
    });

    return NextResponse.json({ buses });
  } catch (error) {
    console.error('[BUSES_GET]', error);
    return NextResponse.json({ error: 'Failed to load buses.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');
    if (!userId) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    if (!['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'].includes(userRole || '')) {
      return NextResponse.json({ error: 'Insufficient permissions', code: 'FORBIDDEN' }, { status: 403 });
    }

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 }); }

    const validation = createBusSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed', code: 'VALIDATION_ERROR',
        details: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }

    const d = validation.data;

    // Driver must exist and be a DRIVER
    const driver = await prisma.staff.findUnique({ where: { id: d.driverId } });
    if (!driver || driver.staffType !== 'DRIVER') {
      return NextResponse.json({ error: 'Assigned staff must be a registered Driver.', code: 'INVALID_DRIVER' }, { status: 400 });
    }

    const existing = await prisma.bus.findUnique({ where: { busNo: d.busNo } });
    if (existing) {
      return NextResponse.json({ error: `Bus number '${d.busNo}' already exists.`, code: 'DUPLICATE_RECORD' }, { status: 409 });
    }

    const parseDate = (val?: string) => val ? new Date(val) : null;

    const bus = await prisma.bus.create({
      data: {
        busNo: d.busNo, route: d.route, driverId: d.driverId,
        seatingCapacity: d.seatingCapacity, status: BusStatus.ACTIVE,
        registrationDate: parseDate(d.registrationDate),
        fitnessExpiry: parseDate(d.fitnessExpiry),
        taxExpiry: parseDate(d.taxExpiry),
        insuranceExpiry: parseDate(d.insuranceExpiry),
        puccExpiry: parseDate(d.puccExpiry),
        permitExpiry: parseDate(d.permitExpiry),
      },
      include: { driver: { select: { name: true } } },
    });

    await logAuditEvent(userId, 'CREATE', 'Bus', bus.id, { busNo: d.busNo, route: d.route });
    return NextResponse.json({ bus }, { status: 201 });
  } catch (error) {
    console.error('[BUSES_POST]', error);
    return NextResponse.json({ error: 'Failed to create bus.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
