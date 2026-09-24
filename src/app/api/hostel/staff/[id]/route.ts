/**
 * @module api/hostel/staff/[id]
 * @description Hostel staff profile + month-by-month salary status, and salary payout.
 *
 * GET  — Staff details + a 12-month salary table (expected vs paid vs remaining per month).
 * POST — { action: 'pay_salary', month, year, amount, date } records a HOSTEL_SALARY expense.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAuditEvent } from '@/lib/audit';
import { hostelGuard } from '@/lib/hostelAuth';
import { recordTransaction } from '@/lib/finance';
import { PaymentMode } from '@prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid ID', code: 'INVALID_ID' }, { status: 400 });
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    const staff = await prisma.hostelStaff.findUnique({ where: { id } });
    if (!staff) return NextResponse.json({ error: 'Staff not found', code: 'NOT_FOUND' }, { status: 404 });

    // Last 12 months salary status
    const now = new Date();
    const monthly = Number(staff.monthlySalary);
    const months: { month: string; year: number; expected: number; paid: number; remaining: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = MONTHS[dt.getMonth()];
      const y = dt.getFullYear();
      const paidAgg = await prisma.transaction.aggregate({
        where: { hostelStaffId: id, category: 'HOSTEL_SALARY', periodMonth: m, periodYear: y },
        _sum: { amount: true },
      });
      const paid = Number(paidAgg._sum.amount || 0);
      months.push({ month: m, year: y, expected: monthly, paid, remaining: Math.max(0, monthly - paid) });
    }

    const totalPaidAgg = await prisma.transaction.aggregate({
      where: { hostelStaffId: id, category: 'HOSTEL_SALARY' }, _sum: { amount: true },
    });

    return NextResponse.json({ staff, months, totalPaid: Number(totalPaidAgg._sum.amount || 0) });
  } catch (error) {
    console.error('[HOSTEL_STAFF_DETAIL_GET]', error);
    return NextResponse.json({ error: 'Failed to load staff.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid ID', code: 'INVALID_ID' }, { status: 400 });
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    const staff = await prisma.hostelStaff.findUnique({ where: { id } });
    if (!staff) return NextResponse.json({ error: 'Staff not found', code: 'NOT_FOUND' }, { status: 404 });

    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    if (body.action === 'pay_salary') {
      const amount = Number(body.amount);
      if (!(amount > 0)) return NextResponse.json({ error: 'Enter a positive amount.', code: 'INVALID_AMOUNT' }, { status: 400 });
      const month = body.month;
      const year = Number(body.year);
      if (!MONTHS.includes(month) || !year) return NextResponse.json({ error: 'Valid month and year required.', code: 'BAD_REQUEST' }, { status: 400 });
      const date = body.date ? new Date(body.date) : new Date();

      await recordTransaction({
        direction: 'EXPENSE', category: 'HOSTEL_SALARY', amount, date,
        description: `Hostel salary — ${staff.name} (${staff.role}) | ${month} ${year}`,
        unitId: 'hostel', hostelStaffId: id,
        paymentMode: (body.paymentMode as PaymentMode) || 'CASH',
        periodMonth: month, periodYear: year, source: 'HOSTEL', createdBy: auth.userId,
      });

      await logAuditEvent(auth.userId, 'CREATE', 'HostelSalary', id, { staffName: staff.name, amount, month, year });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action', code: 'BAD_REQUEST' }, { status: 400 });
  } catch (error) {
    console.error('[HOSTEL_STAFF_DETAIL_POST]', error);
    return NextResponse.json({ error: 'Failed to process action.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

/**
 * PATCH /api/hostel/staff/[id] — update the editable fields of a hostel staff member.
 * Salary, contact, identity, and document links can all be changed here; join date
 * stays locked. Status flips between ACTIVE / RESIGNED / SUSPENDED.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid ID', code: 'INVALID_ID' }, { status: 400 });
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    const existing = await prisma.hostelStaff.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Staff not found', code: 'NOT_FOUND' }, { status: 404 });

    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    // Salary validation: if present, must parse to a non-negative number.
    let monthlySalary = existing.monthlySalary;
    if (body.monthlySalary !== undefined) {
      const sal = Number(body.monthlySalary);
      if (!Number.isFinite(sal) || sal < 0) {
        return NextResponse.json({ error: 'monthlySalary must be a non-negative number.', code: 'INVALID_VALUE' }, { status: 400 });
      }
      monthlySalary = sal as unknown as typeof existing.monthlySalary;
    }

    if (body.phone !== undefined && body.phone !== null && body.phone !== '') {
      if (!/^\d{10}$/.test(body.phone.replace(/\s|-/g, ''))) {
        return NextResponse.json({ error: 'Phone number must be exactly 10 digits.', code: 'INVALID_VALUE' }, { status: 400 });
      }
    }
    if (body.aadharNo !== undefined && body.aadharNo !== null && body.aadharNo !== '') {
      if (!/^\d{12}$/.test(body.aadharNo.replace(/\s|-/g, ''))) {
        return NextResponse.json({ error: 'Aadhar number must be exactly 12 digits.', code: 'INVALID_VALUE' }, { status: 400 });
      }
    }

    const updated = await prisma.hostelStaff.update({
      where: { id },
      data: {
        name: body.name !== undefined ? body.name : existing.name,
        role: body.role !== undefined ? body.role : existing.role,
        fatherName: body.fatherName !== undefined ? body.fatherName : existing.fatherName,
        phone: body.phone !== undefined ? body.phone : existing.phone,
        address: body.address !== undefined ? body.address : existing.address,
        monthlySalary,
        aadharNo: body.aadharNo !== undefined ? body.aadharNo : existing.aadharNo,
        panNo: body.panNo !== undefined ? body.panNo : existing.panNo,
        bankAccountNo: body.bankAccountNo !== undefined ? body.bankAccountNo : existing.bankAccountNo,
        photoUrl: body.photoUrl !== undefined ? body.photoUrl : existing.photoUrl,
        aadharDocUrl: body.aadharDocUrl !== undefined ? body.aadharDocUrl : existing.aadharDocUrl,
        otherDocUrl: body.otherDocUrl !== undefined ? body.otherDocUrl : existing.otherDocUrl,
        status: body.status !== undefined ? body.status : existing.status,
      },
    });

    await logAuditEvent(auth.userId, 'UPDATE', 'HostelStaff', id, { name: updated.name });
    return NextResponse.json({ staff: updated });
  } catch (error) {
    console.error('[HOSTEL_STAFF_DETAIL_PATCH]', error);
    return NextResponse.json({ error: 'Failed to update hostel staff.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
