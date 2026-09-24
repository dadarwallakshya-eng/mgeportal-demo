/**
 * @file src/app/api/fees/payments/[id]/reverse/route.ts
 * @description Soft-reverse a fee receipt. Records the reversal on the receipt
 *              row, restores allocation amount_paid, recomputes status, and
 *              posts a counter-transaction in the Income & Expense ledger.
 *
 *   POST /api/fees/payments/{id}/reverse
 *   Body (optional): { reason?: string }
 *
 *   Rules per the user's choice:
 *     - Anyone authenticated with access to the student's unit can reverse
 *       (same gate as collecting in the first place).
 *     - Reason is optional but recorded if provided.
 *
 *   Atomicity: PgBouncer transaction mode forbids prisma.$transaction, so each
 *   write is sequential. If a later step fails, the earlier writes ARE persisted;
 *   the receipt-level reversal flag is written LAST so /api/finance views are
 *   consistent — until that flag flips, the original receipt is still "live".
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { recordTransaction } from '@/lib/finance';
import { logAuditEvent } from '@/lib/audit';
import { FeeStatus } from '@prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid payment ID', code: 'INVALID_ID' }, { status: 400 });
    }

    const userId = request.headers.get('x-user-id');
    const accessUnitsRaw = request.headers.get('x-user-access-units');
    if (!userId || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    // Body is optional (operator picked: reason optional).
    let reason: string | null = null;
    try {
      const body = await request.json().catch(() => ({}));
      if (typeof body?.reason === 'string' && body.reason.trim()) reason = body.reason.trim();
    } catch { /* no body */ }

    // ── Load receipt + verify it can be reversed ────────────────────────────
    const payment = await prisma.feePayment.findUnique({
      where: { id },
      include: {
        student: { select: { id: true, name: true, admissionNo: true, unitId: true } },
        details: true,
      },
    });
    if (!payment) {
      return NextResponse.json({ error: 'Receipt not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    if (!accessUnits.includes(payment.student.unitId)) {
      return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
    }
    if (payment.reversedAt) {
      return NextResponse.json(
        { error: 'This receipt is already reversed.', code: 'ALREADY_REVERSED', reversedAt: payment.reversedAt },
        { status: 409 }
      );
    }

    const totalAmount = Number(payment.totalAmount);

    // ── 1. Restore each allocation's amount_paid and recompute its status ───
    // Status uses the discount-adjusted net due (matches the collect endpoint).
    const studentRow = await prisma.student.findUnique({
      where: { id: payment.studentId },
      include: { concessions: { select: { feeComponentName: true, discountType: true, value: true } } },
    });
    const pctByComponent = new Map<string, number>();
    for (const c of studentRow?.concessions || []) {
      if (c.discountType === 'PERCENTAGE') pctByComponent.set(c.feeComponentName, Number(c.value));
    }

    for (const d of payment.details) {
      const alloc = await prisma.feeAllocation.findUnique({
        where: { id: d.feeAllocationId },
        include: { feeComponent: { select: { name: true } } },
      });
      if (!alloc) continue; // allocation deleted somehow; nothing to roll back

      const restored = Math.max(0, Number(alloc.amountPaid) - Number(d.amountApplied));
      const pct = pctByComponent.get(alloc.feeComponent.name) ?? 0;
      const netDue = Number(alloc.amountDue) * (1 - pct / 100);
      const newStatus: FeeStatus =
        restored >= netDue - 0.005 ? FeeStatus.PAID
          : restored > 0           ? FeeStatus.PARTIALLY_PAID
          :                          FeeStatus.UNPAID;

      await prisma.feeAllocation.update({
        where: { id: alloc.id },
        data: { amountPaid: restored, status: newStatus },
      });
    }

    // ── 2. Post the counter-transaction in the ledger ──────────────────────
    // EXPENSE / OTHER_EXPENSE so the books read clearly: original receipt
    // shows as +X under FEE, this entry shows as -X under OTHER_EXPENSE, with
    // a description that explicitly ties it back to the original receipt.
    const refundDesc = `Refund — receipt ${payment.receiptNo} reversed — ${payment.student.name} (${payment.student.admissionNo})${reason ? ` | reason: ${reason}` : ''}`;
    await recordTransaction({
      direction: 'EXPENSE',
      category: 'OTHER_EXPENSE',
      amount: totalAmount,
      date: new Date(),
      description: refundDesc,
      unitId: payment.student.unitId,
      studentId: payment.studentId,
      paymentMode: payment.paymentMode,
      referenceNo: payment.receiptNo,
      source: 'FEES_REVERSAL',
      createdBy: userId,
    });

    // ── 3. Stamp the receipt as reversed (LAST — see file comment) ──────────
    const updated = await prisma.feePayment.update({
      where: { id },
      data: {
        reversedAt: new Date(),
        reversedBy: userId,
        reversalReason: reason,
      },
    });

    await logAuditEvent(userId, 'UPDATE', 'FeePayment', id, {
      action: 'reverse',
      receiptNo: payment.receiptNo,
      amount: totalAmount,
      reason: reason || undefined,
    });

    return NextResponse.json({
      ok: true,
      payment: updated,
      restoredAllocations: payment.details.length,
    });
  } catch (error) {
    console.error('[FEE_PAYMENT_REVERSE]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reverse receipt.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
