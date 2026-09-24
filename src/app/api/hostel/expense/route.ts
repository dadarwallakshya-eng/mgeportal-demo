/**
 * @module api/hostel/expense
 * @description Hostel expense entries (Mess, Laundry, Other) — logged where the money went.
 *
 * GET  — List hostel expense transactions, filterable by category (MESS / LAUNDRY / OTHER_EXPENSE).
 * POST — Add a hostel expense (records an EXPENSE Transaction with unitId='hostel').
 *
 * (Salary and daily-use expenses are recorded by their own endpoints; this is for direct spends.)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { hostelGuard } from '@/lib/hostelAuth';
import { checkTransactionDeletion } from '@/lib/anomalyAgent';
import { recordTransaction } from '@/lib/finance';
import { TxnCategory, PaymentMode } from '@prisma/client';

const createSchema = z.object({
  category: z.enum(['MESS', 'LAUNDRY', 'OTHER_EXPENSE', 'GHAR', 'SCHOOL', 'RELIGIOUS_SOCIAL']),
  amount: z.preprocess(Number, z.number().positive('Amount must be positive')),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  description: z.string().max(500).trim().optional(),
  paymentMode: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI']).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const categoryParam = searchParams.get('category') || 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limitParam = searchParams.get('limit');

    const where: Record<string, unknown> = { unitId: 'hostel', direction: 'EXPENSE' };
    if (categoryParam !== 'all') {
      where.category = categoryParam as TxnCategory;
    } else if (auth.role !== 'DIRECTOR') {
      // Non-directors cannot see GHAR or SCHOOL in all expenses view
      where.category = { notIn: ['GHAR', 'SCHOOL'] };
    }

    // If non-director specifically asks for GHAR or SCHOOL, deny visibility
    if (auth.role !== 'DIRECTOR' && (categoryParam === 'GHAR' || categoryParam === 'SCHOOL')) {
      return NextResponse.json({ expenses: [], pagination: { total: 0, page: 1, limit: 1000, pages: 0 } });
    }

    let expenses;
    let total;

    if (limitParam === 'unlimited') {
      [expenses, total] = await Promise.all([
        prisma.transaction.findMany({ where, orderBy: { date: 'desc' } }),
        prisma.transaction.count({ where }),
      ]);
      return NextResponse.json({ expenses, pagination: { total, page: 1, limit: total, pages: 1 } });
    } else {
      const limit = Math.max(1, Math.min(1000, parseInt(limitParam || '1000')));
      const skip = (page - 1) * limit;
      [expenses, total] = await Promise.all([
        prisma.transaction.findMany({ where, orderBy: { date: 'desc' }, skip, take: limit }),
        prisma.transaction.count({ where }),
      ]);
      return NextResponse.json({ expenses, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
    }
  } catch (error) {
    console.error('[HOSTEL_EXPENSE_GET]', error);
    return NextResponse.json({ error: 'Failed to load expenses.', code: 'INTERNAL_ERROR' }, { status: 500 });
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

    const txn = await recordTransaction({
      direction: 'EXPENSE', category: d.category as TxnCategory, amount: d.amount, date: new Date(d.date),
      description: d.description || null, unitId: 'hostel',
      paymentMode: (d.paymentMode as PaymentMode) || 'CASH', source: 'HOSTEL', createdBy: auth.userId,
    });

    await logAuditEvent(auth.userId, 'CREATE', 'HostelExpense', txn.id, { category: d.category, amount: d.amount });
    return NextResponse.json({ expense: txn }, { status: 201 });
  } catch (error) {
    console.error('[HOSTEL_EXPENSE_POST]', error);
    return NextResponse.json({ error: 'Failed to add expense.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    let body: any;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 }); }

    const { id, amount, category, date, description, paymentMode } = body;
    if (!id) return NextResponse.json({ error: 'Transaction ID required', code: 'MISSING_PARAM' }, { status: 400 });

    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing || existing.isDeleted || existing.unitId !== 'hostel') {
      return NextResponse.json({ error: 'Expense transaction not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        ...(amount ? { amount: Number(amount) } : {}),
        ...(category ? { category: category as TxnCategory } : {}),
        ...(date ? { date: new Date(date) } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(paymentMode ? { paymentMode: paymentMode as PaymentMode } : {}),
      },
    });

    await logAuditEvent(auth.userId, 'UPDATE', 'HostelExpense', id, { updated });
    return NextResponse.json({ expense: updated });
  } catch (error) {
    console.error('[HOSTEL_EXPENSE_PATCH]', error);
    return NextResponse.json({ error: 'Failed to update expense.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Transaction ID required', code: 'MISSING_PARAM' }, { status: 400 });

    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing || existing.isDeleted || existing.unitId !== 'hostel') {
      return NextResponse.json({ error: 'Expense transaction not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    await checkTransactionDeletion(id);

    await prisma.transaction.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    await logAuditEvent(auth.userId, 'DELETE', 'HostelExpense', id, { category: existing.category, amount: existing.amount });
    return NextResponse.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('[HOSTEL_EXPENSE_DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete expense.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
