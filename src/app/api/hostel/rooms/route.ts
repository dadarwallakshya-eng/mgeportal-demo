/**
 * @module api/hostel/rooms
 * @description Hostel room inventory (rooms of different strengths/capacities).
 *
 * GET  — All rooms with occupancy.
 * POST — Add a room.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { hostelGuard } from '@/lib/hostelAuth';
import { RoomType } from '@prisma/client';

const createSchema = z.object({
  roomNo: z.string().min(1, 'Room number required').max(20).trim(),
  floor: z.string().min(1, 'Floor required').max(30).trim(),
  capacity: z.preprocess(Number, z.number().int().positive('Capacity must be positive')),
  type: z.enum(['AC', 'NON_AC', 'DELUXE']),
  monthlyRent: z.preprocess((v) => (v === '' || v == null ? 0 : Number(v)), z.number().min(0)).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    const rooms = await prisma.hostelRoom.findMany({
      orderBy: [{ floor: 'asc' }, { roomNo: 'asc' }],
    });
    return NextResponse.json({ rooms });
  } catch (error) {
    console.error('[HOSTEL_ROOMS_GET]', error);
    return NextResponse.json({ error: 'Failed to load rooms.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 }); }

    const v = createSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json({
        error: 'Validation failed', code: 'VALIDATION_ERROR',
        details: v.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }
    const d = v.data;

    const existing = await prisma.hostelRoom.findUnique({ where: { roomNo: d.roomNo } });
    if (existing) return NextResponse.json({ error: `Room ${d.roomNo} already exists.`, code: 'DUPLICATE_RECORD' }, { status: 409 });

    const room = await prisma.hostelRoom.create({
      data: {
        roomNo: d.roomNo, floor: d.floor, capacity: d.capacity,
        occupiedCount: 0, monthlyRent: d.monthlyRent || 0, type: d.type as RoomType, status: 'AVAILABLE',
      },
    });

    await logAuditEvent(auth.userId, 'CREATE', 'HostelRoom', room.id, { roomNo: d.roomNo, capacity: d.capacity });
    return NextResponse.json({ room }, { status: 201 });
  } catch (error) {
    console.error('[HOSTEL_ROOMS_POST]', error);
    return NextResponse.json({ error: 'Failed to add room.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
