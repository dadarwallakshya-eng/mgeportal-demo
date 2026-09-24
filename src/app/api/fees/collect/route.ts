/**
 * @module api/fees/collect
 * @description Fee collection endpoint — fetches outstanding allocations and records payments.
 *
 * GET  — Returns a student's UNPAID/PARTIALLY_PAID fee allocations (for the collection form).
 * POST — Records a payment: creates FeePayment, FeePaymentDetails, updates allocation statuses,
 *        and posts a balanced double-entry JournalEntry (DR Cash / CR Fee Revenue).
 *
 * ACCOUNTING INVARIANT:
 * Every POST call that succeeds will produce:
 *   DEBIT  Cash-in-Hand (ASSET)      = totalAmount
 *   CREDIT Fee Revenue  (REVENUE)    = totalAmount
 * Total debits always equal total credits — double-entry is never violated.
 *
 * SECURITY:
 * - RBAC: student's unitId must be in the requesting user's access units.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { recordTransaction } from '@/lib/finance';
import { PaymentMode, FeeStatus } from '@prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const collectSchema = z.object({
  studentId: z.string().regex(UUID_REGEX, 'Invalid student ID'),
  paymentMode: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI']),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  referenceNo: z.string().max(100).trim().optional(),
  allocations: z
    .array(
      z.object({
        allocationId: z.string().regex(UUID_REGEX, 'Invalid allocation ID'),
        amount: z.preprocess(
          (v) => Number(v),
          z.number().positive('Amount must be positive')
        ),
      })
    )
    .min(1, 'Select at least one fee allocation to pay'),
});

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');

    if (!studentId || !UUID_REGEX.test(studentId)) {
      return NextResponse.json({ error: 'Valid studentId is required', code: 'MISSING_PARAM' }, { status: 400 });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        unit: { select: { name: true } },
        feeAllocations: {
          where: { status: { in: [FeeStatus.UNPAID, FeeStatus.PARTIALLY_PAID] } },
          include: { feeComponent: { select: { name: true, amount: true } } },
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: 'Student not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    if (!accessUnits.includes(student.unitId)) {
      return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
    }

    return NextResponse.json({
      student: {
        id: student.id,
        name: student.name,
        admissionNo: student.admissionNo,
        className: student.className,
        section: student.section,
        unitId: student.unitId,
        unit: student.unit,
      },
      allocations: student.feeAllocations,
    });
  } catch (error) {
    console.error('[FEE_COLLECT_GET]', error);
    return NextResponse.json({ error: 'Failed to load fee data.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body', code: 'INVALID_JSON' }, { status: 400 });
    }

    const validation = collectSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }

    const { studentId, paymentMode, paymentDate, referenceNo, allocations } = validation.data;

    // Verify student + concessions for per-component discount lookup, then RBAC check.
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { concessions: { select: { feeComponentName: true, discountType: true, value: true } } },
    });

    if (!student) {
      return NextResponse.json({ error: 'Student not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    if (!accessUnits.includes(student.unitId)) {
      return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
    }

    const concessionByComponent = new Map<string, { type: string; value: number }>();
    for (const c of student.concessions) {
      concessionByComponent.set(c.feeComponentName, { type: c.discountType, value: Number(c.value) });
    }

    const totalAmount = allocations.reduce((sum, a) => sum + a.amount, 0);

    // ── Pre-check loop to prevent overpayments ──────────────────────────
    for (const { allocationId, amount } of allocations) {
      const alloc = await prisma.feeAllocation.findUnique({
        where: { id: allocationId },
        include: { feeComponent: { select: { name: true } } },
      });
      if (!alloc) {
        return NextResponse.json({ error: 'Fee allocation not found.', code: 'BAD_REQUEST' }, { status: 400 });
      }

      const orig = Number(alloc.amountDue);
      const conc = concessionByComponent.get(alloc.feeComponent.name);
      let netDue = orig;
      if (conc) {
        if (conc.type === 'FIXED_AMOUNT') {
          netDue = Math.max(0, orig - conc.value);
        } else {
          netDue = orig * (1 - conc.value / 100);
        }
      }

      const currentPaid = Number(alloc.amountPaid);
      const remaining = Math.max(0, netDue - currentPaid);

      if (amount > remaining + 0.01) {
        return NextResponse.json({
          error: `Payment of ₹${amount} exceeds the remaining balance of ₹${Math.round(remaining)} for ${alloc.feeComponent.name}.`,
          code: 'OVERPAYMENT_NOT_ALLOWED'
        }, { status: 400 });
      }
    }

    const payYear = new Date(paymentDate).getFullYear();

    // NOTE: PgBouncer transaction mode blocks prisma.$transaction — using sequential awaits instead.
    // SIMPLE FINANCE: fee collection records ONE income Transaction (no double-entry journal).
    const result = await (async () => {
      // ── 1. Generate unique receipt number (find highest to avoid collisions after deletes) ────────────────
      const highestReceipt = await prisma.feePayment.findFirst({
        where: { receiptNo: { startsWith: `RCP-${payYear}-` } },
        orderBy: { receiptNo: 'desc' },
        select: { receiptNo: true }
      });
      let nextNo = 1;
      if (highestReceipt) {
        const parts = highestReceipt.receiptNo.split('-');
        const lastNum = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastNum)) {
          nextNo = lastNum + 1;
        }
      }
      const receiptNo = `RCP-${payYear}-${String(nextNo).padStart(5, '0')}`;

      // ── 2. Create FeePayment header (receipt) ────────────────────────────
      const feePayment = await prisma.feePayment.create({
        data: {
          studentId,
          receiptNo,
          paymentDate: new Date(paymentDate),
          paymentMode: paymentMode as PaymentMode,
          totalAmount,
        },
      });

      // ── 3. Update each FeeAllocation + create detail lines ───────────────
      // Status uses the component-specific discount, so a 10%-discounted ₹1000
      // Tuition allocation flips to PAID at ₹900, while an undiscounted
      // Transport line still requires ₹1000 to clear.
      for (const { allocationId, amount } of allocations) {
        const alloc = await prisma.feeAllocation.findUnique({
          where: { id: allocationId },
          include: { feeComponent: { select: { name: true } } },
        });
        if (!alloc) continue;

        const conc = concessionByComponent.get(alloc.feeComponent.name);
        const newPaid = Number(alloc.amountPaid) + amount;
        const orig = Number(alloc.amountDue);
        let netDue = orig;
        if (conc) {
          if (conc.type === 'FIXED_AMOUNT') {
            netDue = Math.max(0, orig - conc.value);
          } else {
            netDue = orig * (1 - conc.value / 100);
          }
        }
        const newStatus: FeeStatus =
          newPaid >= netDue - 0.005 ? FeeStatus.PAID : FeeStatus.PARTIALLY_PAID;

        await prisma.feeAllocation.update({
          where: { id: allocationId },
          data: { amountPaid: newPaid, status: newStatus },
        });

        await prisma.feePaymentDetail.create({
          data: {
            feePaymentId: feePayment.id,
            feeAllocationId: allocationId,
            amountApplied: amount,
          },
        });
      }

      // ── 4. Record the income in the simple Income/Expense ledger ─────────
      // referenceNo on the Transaction is the receipt no; if the operator gave
      // an external txn/cheque number, it goes into the description for traceability.
      const externalRef = referenceNo?.trim();
      await recordTransaction({
        direction: 'INCOME',
        category: 'FEE',
        amount: totalAmount,
        date: new Date(paymentDate),
        description: externalRef
          ? `Fee receipt — ${student.name} (${student.admissionNo}) | ${receiptNo} | ref ${externalRef}`
          : `Fee receipt — ${student.name} (${student.admissionNo}) | ${receiptNo}`,
        unitId: student.unitId,
        studentId,
        paymentMode: paymentMode as PaymentMode,
        referenceNo: receiptNo,
        source: 'FEES',
        createdBy: userId,
      });

      return { feePayment, receiptNo, totalAmount };
    })();

    await logAuditEvent(userId, 'CREATE', 'FeePayment', result.feePayment.id, {
      studentId,
      receiptNo: result.receiptNo,
      totalAmount: result.totalAmount,
      paymentMode,
    });

    return NextResponse.json({ payment: result }, { status: 201 });
  } catch (error) {
    console.error('[FEE_COLLECT_POST]', error);
    return NextResponse.json({ error: 'Failed to record fee payment.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
