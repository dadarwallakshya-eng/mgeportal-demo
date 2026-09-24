/**
 * @module api/hostel/staff
 * @description Hostel staff (warden, cook, mess workers, cleaners) — simple monthly salary, no TDS/PF.
 *
 * GET  — List staff with this month's salary status (expected vs paid vs remaining).
 * POST — Add a staff member (salary decided at registration).
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { hostelGuard } from '@/lib/hostelAuth';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const createSchema = z.object({
  name: z.string().min(2, 'Name is required').max(150).trim(),
  role: z.string().min(1, 'Role is required').max(100).trim(),
  fatherName: z.string().max(150).trim().optional().or(z.literal('')),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'DOB must be YYYY-MM-DD').optional().or(z.literal('')),
  phone: z.string().trim().refine(val => !val || /^\d{10}$/.test(val.replace(/\s|-/g, '')), {
    message: 'Phone number must be exactly 10 digits',
  }).optional().or(z.literal('')),
  address: z.string().max(300).trim().optional().or(z.literal('')),
  monthlySalary: z.preprocess(Number, z.number().positive('Salary must be positive')),
  joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Join date must be YYYY-MM-DD'),
  aadharNo: z.string().trim().refine(val => !val || /^\d{12}$/.test(val.replace(/\s|-/g, '')), {
    message: 'Aadhar number must be exactly 12 digits',
  }).optional().or(z.literal('')),
  panNo: z.string().max(15).trim().optional().or(z.literal('')),
  bankAccountNo: z.string().max(30).trim().optional().or(z.literal('')),
  photoUrl: z.string().trim().min(1, 'Staff photo is required'),
  aadharDocUrl: z.string().trim().min(1, 'Aadhar document is required'),
  otherDocUrl: z.string().trim().optional().or(z.literal('')),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'ACTIVE';
    const now = new Date();
    const curMonth = MONTHS[now.getMonth()];
    const curYear = now.getFullYear();

    const staff = await prisma.hostelStaff.findMany({
      where: { status: status as 'ACTIVE' | 'RESIGNED' | 'SUSPENDED' },
      orderBy: { name: 'asc' },
    });

    // This month's paid amount per staff
    const withStatus = await Promise.all(staff.map(async (s) => {
      const paidAgg = await prisma.transaction.aggregate({
        where: { hostelStaffId: s.id, category: 'HOSTEL_SALARY', periodMonth: curMonth, periodYear: curYear },
        _sum: { amount: true },
      });
      const paidThisMonth = Number(paidAgg._sum.amount || 0);
      const monthly = Number(s.monthlySalary);
      return { ...s, currentMonth: curMonth, currentYear: curYear, paidThisMonth, remainingThisMonth: Math.max(0, monthly - paidThisMonth) };
    }));

    return NextResponse.json({ staff: withStatus, currentMonth: curMonth, currentYear: curYear });
  } catch (error) {
    console.error('[HOSTEL_STAFF_GET]', error);
    return NextResponse.json({ error: 'Failed to load hostel staff.', code: 'INTERNAL_ERROR' }, { status: 500 });
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

    const staff = await prisma.hostelStaff.create({
      data: {
        name: d.name, role: d.role,
        fatherName: d.fatherName || null,
        dob: d.dob ? new Date(d.dob) : null,
        phone: d.phone || null, address: d.address || null,
        monthlySalary: d.monthlySalary, joinDate: new Date(d.joinDate),
        aadharNo: d.aadharNo || null,
        panNo: d.panNo || null,
        bankAccountNo: d.bankAccountNo || null,
        photoUrl: d.photoUrl || null,
        aadharDocUrl: d.aadharDocUrl || null,
        otherDocUrl: d.otherDocUrl || null,
        status: 'ACTIVE',
      },
    });

    await logAuditEvent(auth.userId, 'CREATE', 'HostelStaff', staff.id, { name: d.name, role: d.role });
    return NextResponse.json({ staff }, { status: 201 });
  } catch (error) {
    console.error('[HOSTEL_STAFF_POST]', error);
    return NextResponse.json({ error: 'Failed to add hostel staff.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
