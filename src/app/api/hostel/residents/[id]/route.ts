/**
 * @module api/hostel/residents/[id]
 * @description Single resident — full account, plus actions (collect fee / give daily-use money).
 *
 * GET   — Resident profile: account summary + fee-payment history + daily-use history.
 * PATCH — Update discount / room / status (manager can discount up to 100%).
 * POST  — { action: 'pay' }        records a HOSTEL_FEE income (money received).
 *         { action: 'daily_use' }  records a DAILY_USE expense (money given to the student,
 *                                    which also increases what he owes).
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAuditEvent } from '@/lib/audit';
import { hostelGuard } from '@/lib/hostelAuth';
import { getResidentAccount } from '@/lib/hostel';
import { recordTransaction } from '@/lib/finance';
import { DiscountType, PaymentMode } from '@prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid ID', code: 'INVALID_ID' }, { status: 400 });
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    const resident = await prisma.hostelResident.findUnique({
      where: { id },
      include: {
        student: { select: { id: true, name: true, admissionNo: true, className: true, section: true, phone: true, fatherName: true, photoUrl: true, unit: { select: { name: true } } } },
        room: { select: { roomNo: true, floor: true, type: true } },
      },
    });
    if (!resident) return NextResponse.json({ error: 'Resident not found', code: 'NOT_FOUND' }, { status: 404 });

    const account = await getResidentAccount(
      resident.studentId,
      Number(resident.annualFee),
      resident.discountType,
      Number(resident.discountValue),
      Number(resident.previousOutstanding || 0)
    );

    // Histories from the transaction ledger (include deleted transactions for audit trail in UI)
    const [payments, dailyUse] = await Promise.all([
      prisma.transaction.findMany({
        where: { studentId: resident.studentId, direction: 'INCOME', category: 'HOSTEL_FEE' },
        orderBy: { date: 'desc' },
      }),
      prisma.transaction.findMany({
        where: { studentId: resident.studentId, direction: 'EXPENSE', category: 'DAILY_USE' },
        orderBy: { date: 'desc' },
      }),
    ]);

    return NextResponse.json({ resident, account, payments, dailyUse });
  } catch (error) {
    console.error('[HOSTEL_RESIDENT_GET]', error);
    return NextResponse.json({ error: 'Failed to load resident.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid ID', code: 'INVALID_ID' }, { status: 400 });
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    const existing = await prisma.hostelResident.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });

    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    // Discount value sanity: percentage 0-100
    let discountType = body.discountType !== undefined ? body.discountType : existing.discountType;
    let discountValue = body.discountValue !== undefined ? Number(body.discountValue) : Number(existing.discountValue);
    if (discountType === 'PERCENTAGE' && discountValue > 100) discountValue = 100;
    if (!discountType) discountValue = 0;

    const updated = await prisma.hostelResident.update({
      where: { id },
      data: {
        discountType: (discountType as DiscountType) || null,
        discountValue,
        annualFee: body.annualFee !== undefined ? Number(body.annualFee) : existing.annualFee,
        status: body.status || existing.status,
        roomId: body.status === 'TERMINATED' ? null : (body.roomId !== undefined ? body.roomId : existing.roomId),
        checkOutDate: body.status === 'TERMINATED' ? new Date() : (body.status === 'ACTIVE' ? null : existing.checkOutDate),
      },
    });

    await logAuditEvent(auth.userId, 'UPDATE', 'HostelResident', id, { discountType, discountValue });
    return NextResponse.json({ resident: updated });
  } catch (error) {
    console.error('[HOSTEL_RESIDENT_PATCH]', error);
    return NextResponse.json({ error: 'Failed to update resident.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid ID', code: 'INVALID_ID' }, { status: 400 });
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    const resident = await prisma.hostelResident.findUnique({ where: { id }, include: { student: true } });
    if (!resident) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });

    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const amount = Number(body.amount);
    if (!(amount > 0)) return NextResponse.json({ error: 'Enter a positive amount.', code: 'INVALID_AMOUNT' }, { status: 400 });
    const date = body.date ? new Date(body.date) : new Date();

    if (body.action === 'pay') {
      const year = date.getFullYear();
      const highestTx = await prisma.transaction.findFirst({
        where: { category: 'HOSTEL_FEE', referenceNo: { startsWith: `HRCP-${year}-` } },
        orderBy: { referenceNo: 'desc' },
        select: { referenceNo: true }
      });
      let nextNo = 1;
      if (highestTx && highestTx.referenceNo) {
        const parts = highestTx.referenceNo.split('-');
        const lastNum = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastNum)) {
          nextNo = lastNum + 1;
        }
      }
      const referenceNo = `HRCP-${year}-${String(nextNo).padStart(5, '0')}`;

      const componentLabel = body.feeComponent === 'PREVIOUS_DUES'
        ? 'Previous Outstanding Dues'
        : body.feeComponent === 'CURRENT_YEAR'
        ? 'Current Year Hostel Fee'
        : 'All Hostel Dues';

      await recordTransaction({
        direction: 'INCOME', category: 'HOSTEL_FEE', amount, date,
        description: `Hostel Fee (${componentLabel}) — ${resident.student.name} (${resident.student.admissionNo}) | ${referenceNo}`,
        unitId: 'hostel', studentId: resident.studentId,
        paymentMode: (body.paymentMode as PaymentMode) || 'CASH',
        referenceNo, source: 'HOSTEL', createdBy: auth.userId,
        collectorName: auth.role === 'DEPARTMENT_HEAD' ? 'Mr. Suresh Kumar' : 'Principal / Admin',
        collectorRole: auth.role === 'DEPARTMENT_HEAD' ? 'HOD Hostel' : 'School Management',
      });
      await logAuditEvent(auth.userId, 'CREATE', 'HostelFeePayment', resident.id, { amount, referenceNo });
      const account = await getResidentAccount(resident.studentId, Number(resident.annualFee), resident.discountType, Number(resident.discountValue));
      return NextResponse.json({ ok: true, referenceNo, account });
    }

    if (body.action === 'daily_use') {
      await recordTransaction({
        direction: 'EXPENSE', category: 'DAILY_USE', amount, date,
        description: body.description ? `Daily-use — ${resident.student.name}: ${body.description}` : `Daily-use money — ${resident.student.name}`,
        unitId: 'hostel', studentId: resident.studentId,
        paymentMode: 'CASH', source: 'HOSTEL', createdBy: auth.userId,
      });
      await logAuditEvent(auth.userId, 'CREATE', 'HostelDailyUse', resident.id, { amount });
      const account = await getResidentAccount(resident.studentId, Number(resident.annualFee), resident.discountType, Number(resident.discountValue));
      return NextResponse.json({ ok: true, account });
    }

    return NextResponse.json({ error: 'Unknown action', code: 'BAD_REQUEST' }, { status: 400 });
  } catch (error) {
    console.error('[HOSTEL_RESIDENT_POST]', error);
    return NextResponse.json({ error: 'Failed to process action.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
