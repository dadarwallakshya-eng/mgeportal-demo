/**
 * @module api/payroll/[id]
 * @description Pay out a salary slip (posts double-entry journal) or delete a DRAFT slip.
 *
 * PATCH — Mark a slip as PAID. Posts a balanced JournalEntry:
 *           DEBIT  Salary Expense (gross = base + allowances)
 *           CREDIT PF Payable        (pfDeduction)        [if > 0]
 *           CREDIT TDS Payable       (tdsDeduction)       [if > 0]
 *           CREDIT Other Deductions  (otherDeductions)    [if > 0]
 *           CREDIT Cash in Hand      (netSalary)
 *         Sum of credits == debit (gross), so the entry is always balanced.
 *
 * DELETE — Remove a DRAFT slip (cannot delete one that's already PAID — ledger integrity).
 *
 * SECURITY: Only DIRECTOR and PRINCIPAL.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAuditEvent } from '@/lib/audit';
import { recordTransaction } from '@/lib/finance';
import { PaymentMode } from '@prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authGuard(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const userRole = request.headers.get('x-user-role');
  const accessUnitsRaw = request.headers.get('x-user-access-units');
  if (!userId || !accessUnitsRaw) return null;
  if (!['DIRECTOR', 'PRINCIPAL'].includes(userRole || '')) return null;
  return { userId, accessUnits: JSON.parse(accessUnitsRaw) as string[] };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid ID', code: 'INVALID_ID' }, { status: 400 });

    const auth = authGuard(request);
    if (!auth) return NextResponse.json({ error: 'Authentication required or insufficient permissions', code: 'UNAUTHORIZED' }, { status: 401 });

    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const slip = await prisma.salarySlip.findUnique({
      where: { id },
      include: { staff: true },
    });
    if (!slip) return NextResponse.json({ error: 'Salary slip not found', code: 'NOT_FOUND' }, { status: 404 });
    if (!auth.accessUnits.includes(slip.staff.unitId)) {
      return NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 });
    }

    const action = body.action || 'pay';

    // ── Mark as PAID: record ONE simple expense (net salary actually paid) ──
    if (action === 'pay') {
      if (slip.paymentStatus === 'PAID') {
        return NextResponse.json({ error: 'This slip is already paid.', code: 'ALREADY_PAID' }, { status: 409 });
      }

      const paymentMode = (body.paymentMode || 'BANK_TRANSFER') as PaymentMode;
      const paidDate = body.paidDate ? new Date(body.paidDate) : new Date();
      const net = Number(slip.netSalary);

      // Update the slip
      const updated = await prisma.salarySlip.update({
        where: { id },
        data: { paymentStatus: 'PAID', paidDate, paymentMode },
        include: { staff: { select: { name: true, unit: { select: { name: true } } } } },
      });

      // Record the salary payout as an expense in the simple ledger
      await recordTransaction({
        direction: 'EXPENSE',
        category: 'SALARY',
        amount: net,
        date: paidDate,
        description: `Salary — ${slip.staff.name} (${slip.month} ${slip.year})`,
        unitId: slip.staff.unitId,
        staffId: slip.staffId,
        paymentMode,
        periodMonth: slip.month,
        periodYear: slip.year,
        source: 'PAYROLL',
        createdBy: auth.userId,
      });

      await logAuditEvent(auth.userId, 'UPDATE', 'SalarySlip', id, {
        action: 'PAID', staffName: slip.staff.name, netSalary: net,
      });

      return NextResponse.json({ slip: updated });
    }

    // ── Edit amounts (only if still DRAFT) ─────────────────────────────────
    if (action === 'edit') {
      if (slip.paymentStatus === 'PAID') {
        return NextResponse.json({ error: 'Cannot edit a paid slip.', code: 'LOCKED' }, { status: 409 });
      }
      const base = body.baseSalary !== undefined ? Number(body.baseSalary) : Number(slip.baseSalary);
      const allow = body.allowances !== undefined ? Number(body.allowances) : Number(slip.allowances);
      const pf = body.pfDeduction !== undefined ? Number(body.pfDeduction) : Number(slip.pfDeduction);
      const tds = body.tdsDeduction !== undefined ? Number(body.tdsDeduction) : Number(slip.tdsDeduction);
      const other = body.otherDeductions !== undefined ? Number(body.otherDeductions) : Number(slip.otherDeductions);
      const net = base + allow - pf - tds - other;
      if (net < 0) return NextResponse.json({ error: 'Net salary cannot be negative.', code: 'INVALID_AMOUNT' }, { status: 400 });

      const updated = await prisma.salarySlip.update({
        where: { id },
        data: { baseSalary: base, allowances: allow, pfDeduction: pf, tdsDeduction: tds, otherDeductions: other, netSalary: net },
        include: { staff: { select: { name: true, unit: { select: { name: true } } } } },
      });
      await logAuditEvent(auth.userId, 'UPDATE', 'SalarySlip', id, { action: 'EDIT', netSalary: net });
      return NextResponse.json({ slip: updated });
    }

    return NextResponse.json({ error: 'Unknown action', code: 'BAD_REQUEST' }, { status: 400 });
  } catch (error) {
    console.error('[PAYROLL_PATCH]', error);
    return NextResponse.json({ error: 'Failed to process salary slip.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid ID', code: 'INVALID_ID' }, { status: 400 });

    const auth = authGuard(request);
    if (!auth) return NextResponse.json({ error: 'Authentication required or insufficient permissions', code: 'UNAUTHORIZED' }, { status: 401 });

    const slip = await prisma.salarySlip.findUnique({ where: { id }, include: { staff: true } });
    if (!slip) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
    if (!auth.accessUnits.includes(slip.staff.unitId)) {
      return NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 });
    }
    if (slip.paymentStatus === 'PAID') {
      return NextResponse.json({ error: 'Cannot delete a paid slip — ledger entries exist.', code: 'LOCKED' }, { status: 409 });
    }

    await prisma.salarySlip.delete({ where: { id } });
    await logAuditEvent(auth.userId, 'DELETE', 'SalarySlip', id, { staffName: slip.staff.name, month: slip.month, year: slip.year });

    return NextResponse.json({ message: 'Draft salary slip deleted.' });
  } catch (error) {
    console.error('[PAYROLL_DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete salary slip.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
