/**
 * @module api/hostel/residents
 * @description Hostel residents (boys admitted to the hostel).
 *
 * GET  — List residents with their live account (net fee, paid, balance due, daily-use given).
 * POST — Admit a male student: auto annual fee from his class, optional room + discount.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { hostelGuard } from '@/lib/hostelAuth';
import { getResidentAccount } from '@/lib/hostel';
import { getHostelFee } from '@/lib/classes';
import { DiscountType } from '@prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const admitSchema = z.object({
  studentId: z.string().regex(UUID_REGEX, 'Invalid student ID'),
  roomId: z.string().regex(UUID_REGEX).optional().nullable(),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  annualFee: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().min(0)).optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional().nullable(),
  discountValue: z.preprocess((v) => (v === '' || v == null ? 0 : Number(v)), z.number().min(0)).optional(),
  previousOutstanding: z.preprocess((v) => (v === '' || v == null ? 0 : Number(v)), z.number().min(0)).optional(),
});

const updateSchema = z.object({
  residentId: z.string().regex(UUID_REGEX, 'Invalid resident ID'),
  roomId: z.string().regex(UUID_REGEX).optional().nullable(),
  annualFee: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().min(0)).optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional().nullable(),
  discountValue: z.preprocess((v) => (v === '' || v == null ? 0 : Number(v)), z.number().min(0)).optional(),
  previousOutstanding: z.preprocess((v) => (v === '' || v == null ? 0 : Number(v)), z.number().min(0)).optional(),
  action: z.enum(['update', 'readmit']).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'ACTIVE';
    const search = searchParams.get('search')?.trim() || '';

    const whereClause: any = {};
    if (status !== 'ALL') {
      whereClause.status = status as 'ACTIVE' | 'TERMINATED';
    }
    if (search) {
      whereClause.student = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { admissionNo: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const residents = await prisma.hostelResident.findMany({
      where: whereClause,
      include: {
        student: { select: { id: true, name: true, admissionNo: true, className: true, section: true, photoUrl: true, fatherName: true, phone: true, unit: { select: { name: true } } } },
        room: { select: { id: true, roomNo: true, floor: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Attach live account to each
    const withAccounts = await Promise.all(residents.map(async (r) => {
      const account = await getResidentAccount(
        r.studentId,
        Number(r.annualFee),
        r.discountType,
        Number(r.discountValue),
        Number(r.previousOutstanding || 0)
      );
      return { ...r, account };
    }));

    return NextResponse.json({ residents: withAccounts });
  } catch (error) {
    console.error('[HOSTEL_RESIDENTS_GET]', error);
    return NextResponse.json({ error: 'Failed to load residents.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 }); }

    const v = admitSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json({
        error: 'Validation failed', code: 'VALIDATION_ERROR',
        details: v.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }
    const d = v.data;

    const student = await prisma.student.findUnique({ where: { id: d.studentId } });
    if (!student) return NextResponse.json({ error: 'Student not found', code: 'NOT_FOUND' }, { status: 404 });
    if (student.gender !== 'MALE') {
      return NextResponse.json({ error: 'The hostel is boys-only — only male students can be admitted.', code: 'NOT_ELIGIBLE' }, { status: 400 });
    }

    const existing = await prisma.hostelResident.findUnique({ where: { studentId: d.studentId } });
    if (existing) {
      return NextResponse.json({ error: 'This student is already a hostel resident.', code: 'DUPLICATE_RECORD' }, { status: 409 });
    }

    // Annual fee: explicit override, else from the class hostel-fee chart
    const annualFee = d.annualFee ?? getHostelFee(student.className) ?? 0;

    // Optional room capacity check
    if (d.roomId) {
      const room = await prisma.hostelRoom.findUnique({ where: { id: d.roomId } });
      if (!room) return NextResponse.json({ error: 'Room not found', code: 'NOT_FOUND' }, { status: 404 });
      if (room.occupiedCount >= room.capacity) {
        return NextResponse.json({ error: `Room ${room.roomNo} is full.`, code: 'ROOM_FULL' }, { status: 409 });
      }
    }

    const resident = await prisma.hostelResident.create({
      data: {
        studentId: d.studentId,
        roomId: d.roomId || null,
        annualFee,
        discountType: (d.discountType as DiscountType) || null,
        discountValue: d.discountValue || 0,
        previousOutstanding: d.previousOutstanding || 0,
        checkInDate: new Date(d.checkInDate),
        status: 'ACTIVE',
      },
    });

    // Bump room occupancy
    if (d.roomId) {
      await prisma.hostelRoom.update({ where: { id: d.roomId }, data: { occupiedCount: { increment: 1 } } });
    }

    await logAuditEvent(auth.userId, 'CREATE', 'HostelResident', resident.id, {
      studentName: student.name, annualFee,
    });

    return NextResponse.json({ resident }, { status: 201 });
  } catch (error) {
    console.error('[HOSTEL_RESIDENTS_POST]', error);
    return NextResponse.json({ error: 'Failed to admit resident.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 }); }

    const v = updateSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json({
        error: 'Validation failed', code: 'VALIDATION_ERROR',
        details: v.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }
    const d = v.data;

    const existing = await prisma.hostelResident.findUnique({ where: { id: d.residentId } });
    if (!existing) return NextResponse.json({ error: 'Hostel resident record not found', code: 'NOT_FOUND' }, { status: 404 });

    // Handle room changes & occupancy count adjustment
    if (d.roomId !== undefined && d.roomId !== existing.roomId) {
      if (existing.roomId) {
        await prisma.hostelRoom.update({ where: { id: existing.roomId }, data: { occupiedCount: { decrement: 1 } } });
      }
      if (d.roomId) {
        const newRoom = await prisma.hostelRoom.findUnique({ where: { id: d.roomId } });
        if (!newRoom) return NextResponse.json({ error: 'New room not found', code: 'NOT_FOUND' }, { status: 404 });
        if (newRoom.occupiedCount >= newRoom.capacity) {
          return NextResponse.json({ error: `Room ${newRoom.roomNo} is full.`, code: 'ROOM_FULL' }, { status: 409 });
        }
        await prisma.hostelRoom.update({ where: { id: d.roomId }, data: { occupiedCount: { increment: 1 } } });
      }
    }

    const updated = await prisma.hostelResident.update({
      where: { id: d.residentId },
      data: {
        ...(d.action === 'readmit' ? { status: 'ACTIVE', checkOutDate: null, checkInDate: new Date() } : {}),
        ...(d.roomId !== undefined ? { roomId: d.roomId || null } : {}),
        ...(d.annualFee !== undefined ? { annualFee: d.annualFee } : {}),
        ...(d.discountType !== undefined ? { discountType: (d.discountType as DiscountType) || null } : {}),
        ...(d.discountValue !== undefined ? { discountValue: d.discountValue } : {}),
        ...(d.previousOutstanding !== undefined ? { previousOutstanding: d.previousOutstanding } : {}),
      },
    });

    await logAuditEvent(auth.userId, 'UPDATE', 'HostelResident', updated.id, {
      residentId: updated.id,
      changes: d,
    });

    return NextResponse.json({ resident: updated });
  } catch (error) {
    console.error('[HOSTEL_RESIDENTS_PATCH]', error);
    return NextResponse.json({ error: 'Failed to update resident details.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
