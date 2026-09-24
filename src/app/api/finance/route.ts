/**
 * @module api/finance
 * @description The simple Income & Expense ledger API.
 *
 * GET  — Returns the live summary (total income, total expense, NET balance, category breakdown)
 *        plus a paginated list of transactions, filtered by unit / direction / category / date / search.
 * POST — Records a manual income or expense entry.
 *
 * RBAC: results restricted to the user's accessible units. Transactions with no unit (cross-division)
 * are included so the institute-wide net balance is complete for users who can see all units.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { recordTransaction, isCategoryAllowed } from '@/lib/finance';
import { TxnDirection, TxnCategory, PaymentMode } from '@prisma/client';

const manualSchema = z.object({
  direction: z.enum(['INCOME', 'EXPENSE']),
  category: z.enum([
    'FEE', 'HOSTEL_FEE', 'OTHER_INCOME', 'SALARY', 'HOSTEL_SALARY', 'MESS', 'LAUNDRY', 'DAILY_USE', 'TRANSPORT', 'OTHER_EXPENSE',
    'ELECTRICITY', 'WATER', 'STATIONARY', 'MAINTENANCE', 'TELEPHONE_WIFI', 'MARKETING', 'FURNITURE', 'CLEANING', 'OFFICE_EXPENSE'
  ]),
  amount: z.preprocess(Number, z.number().positive('Amount must be positive')),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  description: z.string().max(500).trim().optional(),
  unitId: z.string().optional().nullable(),
  paymentMode: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI']).optional(),
  receiptUrl: z.string().trim().url('Receipt URL must be valid').optional().nullable(),
});

function auth(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const accessUnitsRaw = request.headers.get('x-user-access-units');
  if (!userId || !accessUnitsRaw) return null;
  return { userId, accessUnits: JSON.parse(accessUnitsRaw) as string[] };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const a = auth(request);
    if (!a) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const unitParam = searchParams.get('unit') || 'all';
    const directionParam = searchParams.get('direction') || 'all';
    const categoryParam = searchParams.get('category') || 'all';
    const showDeleted = searchParams.get('showDeleted') === 'true';
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const search = searchParams.get('search')?.trim() || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(5000, parseInt(searchParams.get('limit') || '25')));
    const skip = (page - 1) * limit;

    let targetUnits = a.accessUnits;
    if (unitParam !== 'all') {
      if (!a.accessUnits.includes(unitParam)) {
        return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
      }
      targetUnits = [unitParam];
    }

    const dateFilter: Record<string, Date> = {};
    if (fromDate) dateFilter.gte = new Date(fromDate);
    if (toDate) { const t = new Date(toDate); t.setHours(23, 59, 59, 999); dateFilter.lte = t; }

    // Scope: user's units OR null-unit (cross-division) entries
    const unitScope = { OR: [{ unitId: { in: targetUnits } }, { unitId: null }] };

    const where: Record<string, unknown> = { ...unitScope, isDeleted: showDeleted };
    if (directionParam !== 'all') where.direction = directionParam as TxnDirection;
    if (categoryParam !== 'all') where.category = categoryParam as TxnCategory;
    if (Object.keys(dateFilter).length) where.date = dateFilter;
    if (search) {
      where.AND = [
        unitScope,
        { isDeleted: showDeleted },
        { OR: [
          { description: { contains: search, mode: 'insensitive' } },
          { referenceNo: { contains: search, mode: 'insensitive' } },
        ] },
      ];
      delete where.OR;
    }

    // Summary is over the same unit scope + date range (not direction/category/search, so the
    // net balance reflects everything in view's division/time window).
    const summaryWhere: Record<string, unknown> = { ...unitScope, isDeleted: false };
    if (Object.keys(dateFilter).length) summaryWhere.date = dateFilter;

    const [transactions, total, summaryRows] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          unit: { select: { name: true } },
          student: { select: { name: true, admissionNo: true, fatherName: true, className: true, section: true } },
          staff: { select: { name: true, staffNo: true, department: true, roleOrDesignation: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { date: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
      prisma.transaction.groupBy({
        by: ['direction', 'category'],
        where: summaryWhere,
        _sum: { amount: true },
      }),
    ]);

    let totalIncome = 0, totalExpense = 0;
    const byCategory: Record<string, number> = {};
    for (const r of summaryRows) {
      const amt = Number(r._sum.amount || 0);
      byCategory[r.category] = (byCategory[r.category] || 0) + amt;
      if (r.direction === 'INCOME') totalIncome += amt; else totalExpense += amt;
    }

    return NextResponse.json({
      transactions,
      summary: { totalIncome, totalExpense, net: totalIncome - totalExpense, byCategory },
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[FINANCE_GET]', error);
    return NextResponse.json({ error: 'Failed to load finance data.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const a = auth(request);
    if (!a) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 }); }

    const validation = manualSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed', code: 'VALIDATION_ERROR',
        details: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }

    const d = validation.data;
    if (d.unitId && !a.accessUnits.includes(d.unitId)) {
      return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
    }

    // Category-division validation
    if (!isCategoryAllowed(d.unitId, d.direction as TxnDirection, d.category as TxnCategory)) {
      return NextResponse.json({
        error: `Category ${d.category} is not permitted for the selected division.`,
        code: 'VALIDATION_ERROR',
      }, { status: 400 });
    }

    // Mandatory checks: Description for OTHER_EXPENSE
    if (d.direction === 'EXPENSE' && d.category === 'OTHER_EXPENSE') {
      if (!d.description || !d.description.trim()) {
        return NextResponse.json({
          error: `Description is mandatory for other expenses.`,
          code: 'VALIDATION_ERROR',
        }, { status: 400 });
      }
    }

    // Auto-convert TRANSPORT manual expenses on school divisions to budget transfers
    if (
      d.direction === 'EXPENSE' &&
      d.category === 'TRANSPORT' &&
      d.unitId &&
      ['english', 'hindi', 'college'].includes(d.unitId)
    ) {
      const unitLabels: Record<string, string> = {
        english: 'English Medium',
        hindi: 'Hindi Medium',
        college: 'College',
      };
      
      const dateVal = new Date(d.date);
      
      const sourceTxn = await recordTransaction({
        direction: 'EXPENSE',
        category: 'TRANSPORT',
        amount: d.amount,
        date: dateVal,
        description: `[Intrasystem Budget Transfer to Transport] ${d.description || ''}`.trim(),
        unitId: d.unitId,
        paymentMode: d.paymentMode as PaymentMode || null,
        source: 'TRANSPORT_TRANSFER',
        createdBy: a.userId,
      });

      const targetTxn = await recordTransaction({
        direction: 'INCOME',
        category: 'TRANSPORT',
        amount: d.amount,
        date: dateVal,
        description: `[Intrasystem Budget Transfer from ${unitLabels[d.unitId] || d.unitId}] ${d.description || ''}`.trim(),
        unitId: 'transport',
        paymentMode: d.paymentMode as PaymentMode || null,
        source: 'TRANSPORT_TRANSFER',
        createdBy: a.userId,
      });

      await logAuditEvent(a.userId, 'CREATE', 'TransactionTransfer', targetTxn.id, {
        sourceUnitId: d.unitId,
        amount: d.amount,
        description: d.description,
      });

      return NextResponse.json({ transaction: sourceTxn }, { status: 201 });
    }

    const txn = await recordTransaction({
      direction: d.direction as TxnDirection,
      category: d.category as TxnCategory,
      amount: d.amount,
      date: new Date(d.date),
      description: d.description || null,
      unitId: d.unitId || null,
      paymentMode: d.paymentMode || null,
      receiptUrl: d.receiptUrl || null,
      source: 'MANUAL',
      createdBy: a.userId,
    });

    await logAuditEvent(a.userId, 'CREATE', 'Transaction', txn.id, {
      direction: d.direction, category: d.category, amount: d.amount,
    });

    return NextResponse.json({ transaction: txn }, { status: 201 });
  } catch (error) {
    console.error('[FINANCE_POST]', error);
    return NextResponse.json({ error: 'Failed to record entry.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
