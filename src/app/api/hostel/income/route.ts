/**
 * @module api/hostel/income
 * @description Log and retrieve non-fee income for hostel (e.g. donations, rent, misc. receipts).
 *
 * GET  — List non-fee income transactions for hostel unit.
 * POST — Add a new income entry (records an INCOME Transaction with unitId='hostel').
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { hostelGuard } from '@/lib/hostelAuth';
import { recordTransaction } from '@/lib/finance';
import { checkTransactionDeletion } from '@/lib/anomalyAgent';
import { TxnCategory, PaymentMode } from '@prisma/client';

const createIncomeSchema = z.object({
  category: z.enum(['OTHER_INCOME']).default('OTHER_INCOME'),
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
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limitParam = searchParams.get('limit');

    const where = { unitId: 'hostel', direction: 'INCOME' as const };

    let incomes;
    let total;

    if (limitParam === 'unlimited') {
      [incomes, total] = await Promise.all([
        prisma.transaction.findMany({ where, orderBy: { date: 'desc' } }),
        prisma.transaction.count({ where }),
      ]);
      return NextResponse.json({ incomes, pagination: { total, page: 1, limit: total, pages: 1 } });
    } else {
      const limit = Math.max(1, Math.min(1000, parseInt(limitParam || '1000')));
      const skip = (page - 1) * limit;
      [incomes, total] = await Promise.all([
        prisma.transaction.findMany({ where, orderBy: { date: 'desc' }, skip, take: limit }),
        prisma.transaction.count({ where }),
      ]);
      return NextResponse.json({ incomes, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
    }
  } catch (error) {
    console.error('[HOSTEL_INCOME_GET]', error);
    return NextResponse.json({ error: 'Failed to load income records.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 }); }

    const v = createIncomeSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json({
        error: 'Validation failed', code: 'VALIDATION_ERROR',
        details: v.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }
    const d = v.data;

    const txn = await recordTransaction({
      direction: 'INCOME',
      category: d.category as TxnCategory,
      amount: d.amount,
      date: new Date(d.date),
      description: d.description || null,
      unitId: 'hostel',
      paymentMode: (d.paymentMode as PaymentMode) || 'CASH',
      source: 'HOSTEL',
      createdBy: auth.userId,
    });

    await logAuditEvent(auth.userId, 'CREATE', 'HostelIncome', txn.id, { category: d.category, amount: d.amount });
    return NextResponse.json({ income: txn }, { status: 201 });
  } catch (error) {
    console.error('[HOSTEL_INCOME_POST]', error);
    return NextResponse.json({ error: 'Failed to add income.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    let body: any;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 }); }

    const { id, amount, date, description, paymentMode } = body;
    if (!id) return NextResponse.json({ error: 'Transaction ID required', code: 'MISSING_PARAM' }, { status: 400 });

    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing || existing.isDeleted || existing.unitId !== 'hostel') {
      return NextResponse.json({ error: 'Income transaction not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        ...(amount ? { amount: Number(amount) } : {}),
        ...(date ? { date: new Date(date) } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(paymentMode ? { paymentMode: paymentMode as PaymentMode } : {}),
      },
    });

    await logAuditEvent(auth.userId, 'UPDATE', 'HostelIncome', id, { updated });
    return NextResponse.json({ income: updated });
  } catch (error) {
    console.error('[HOSTEL_INCOME_PATCH]', error);
    return NextResponse.json({ error: 'Failed to update income.', code: 'INTERNAL_ERROR' }, { status: 500 });
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
      return NextResponse.json({ error: 'Income transaction not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    await checkTransactionDeletion(id);

    await prisma.transaction.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    await logAuditEvent(auth.userId, 'DELETE', 'HostelIncome', id, { amount: existing.amount });
    return NextResponse.json({ message: 'Income entry deleted successfully' });
  } catch (error) {
    console.error('[HOSTEL_INCOME_DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete income entry.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
