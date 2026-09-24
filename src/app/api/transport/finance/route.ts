import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { recordTransaction } from '@/lib/finance';
import { TxnDirection, TxnCategory, PaymentMode } from '@prisma/client';

const manualExpenseSchema = z.object({
  direction: z.enum(['INCOME', 'EXPENSE']).default('EXPENSE'),
  subCategory: z.enum(['Diesel / Fuel', 'Maintenance', 'Driver Salary', 'Other']),
  amount: z.preprocess(Number, z.number().positive('Amount must be positive')),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  description: z.string().max(500).trim().optional().or(z.literal('')),
  paymentMode: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI']),
  receiptUrl: z.string().trim().optional().or(z.literal('')),
});

const transferSchema = z.object({
  sourceUnitId: z.enum(['english', 'hindi', 'college']),
  amount: z.preprocess(Number, z.number().positive('Amount must be positive')),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  description: z.string().min(1, 'Description is required').max(500).trim(),
});

function auth(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const accessUnitsRaw = request.headers.get('x-user-access-units');
  const userRole = request.headers.get('x-user-role');
  if (!userId || !accessUnitsRaw) return null;
  return { userId, userRole, accessUnits: JSON.parse(accessUnitsRaw) as string[] };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const a = auth(request);
    if (!a) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });

    if (!a.accessUnits.includes('transport')) {
      return NextResponse.json({ error: 'Access denied for transport division', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const directionParam = searchParams.get('direction') || 'all';
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '25')));
    const skip = (page - 1) * limit;

    const dateFilter: Record<string, Date> = {};
    if (fromDate) dateFilter.gte = new Date(fromDate);
    if (toDate) {
      const t = new Date(toDate);
      t.setHours(23, 59, 59, 999);
      dateFilter.lte = t;
    }

    let where: any = { unitId: 'transport' };
    if (directionParam !== 'all') {
      where.direction = directionParam as TxnDirection;
    }

    if (Object.keys(dateFilter).length) {
      where.date = dateFilter;
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          staff: { select: { name: true, staffNo: true } },
          unit: { select: { name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { date: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    return NextResponse.json({
      transactions,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[TRANSPORT_FINANCE_GET]', error);
    return NextResponse.json({ error: 'Failed to load transport finance data.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const a = auth(request);
    if (!a) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });

    if (!['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'].includes(a.userRole || '')) {
      return NextResponse.json({ error: 'Insufficient permissions', code: 'FORBIDDEN' }, { status: 403 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 });
    }

    // --- CASE 1: Intrasystem Budget Transfer ---
    if (body.action === 'transfer') {
      if (a.userRole !== 'DIRECTOR' && a.userRole !== 'PRINCIPAL') {
        return NextResponse.json({ error: 'Only directors or principals can authorize budget transfers', code: 'FORBIDDEN' }, { status: 403 });
      }

      const validation = transferSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json({
          error: 'Validation failed', code: 'VALIDATION_ERROR',
          details: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
        }, { status: 400 });
      }

      const d = validation.data;
      
      // Security check: Principals can only transfer from their own divisions
      if (a.userRole === 'PRINCIPAL' && !a.accessUnits.includes(d.sourceUnitId)) {
        return NextResponse.json({ error: 'Access denied: You cannot transfer budget from this division.', code: 'FORBIDDEN' }, { status: 403 });
      }

      // Map unit label for audit and description
      const unitLabels: Record<string, string> = {
        english: 'English Medium',
        hindi: 'Hindi Medium',
        college: 'College',
      };

      // Perform transfer (sequential awaits for PgBouncer safety)
      const dateVal = new Date(d.date);

      // 1. Debit Source Division
      const sourceTxn = await recordTransaction({
        direction: 'EXPENSE',
        category: 'TRANSPORT',
        amount: d.amount,
        date: dateVal,
        description: `[Intrasystem Budget Transfer to Transport] ${d.description}`,
        unitId: d.sourceUnitId,
        source: 'TRANSPORT_TRANSFER',
        createdBy: a.userId,
      });

      // 2. Credit Transport Division
      const targetTxn = await recordTransaction({
        direction: 'INCOME',
        category: 'TRANSPORT',
        amount: d.amount,
        date: dateVal,
        description: `[Intrasystem Budget Transfer from ${unitLabels[d.sourceUnitId]}] ${d.description}`,
        unitId: 'transport',
        source: 'TRANSPORT_TRANSFER',
        createdBy: a.userId,
      });

      await logAuditEvent(a.userId, 'CREATE', 'TransactionTransfer', targetTxn.id, {
        sourceUnitId: d.sourceUnitId,
        amount: d.amount,
        description: d.description,
      });

      return NextResponse.json({ success: true, sourceTxn, targetTxn }, { status: 201 });
    }

    // --- CASE 2: Manual Expense Logging ---
    const validation = manualExpenseSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed', code: 'VALIDATION_ERROR',
        details: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }

    const d = validation.data;

    // Enforce receipt upload rules:
    // Maintenance and Diesel/Fuel must have a valid receipt uploader value.
    if (['Maintenance', 'Diesel / Fuel', 'Other'].includes(d.subCategory) && !d.receiptUrl) {
      return NextResponse.json({
        error: `Receipt document upload is mandatory for '${d.subCategory}' expenses.`,
        code: 'VALIDATION_ERROR',
        details: [{ field: 'receiptUrl', message: 'Receipt is mandatory' }],
      }, { status: 400 });
    }

    // Enforce description rules: Maintenance must have description
    if (d.subCategory === 'Maintenance' && !d.description?.trim()) {
      return NextResponse.json({
        error: `Description is mandatory for Maintenance expenses.`,
        code: 'VALIDATION_ERROR',
        details: [{ field: 'description', message: 'Description is mandatory' }],
      }, { status: 400 });
    }

    // Format description with the subcategory prefix
    const finalDescription = d.description?.trim()
      ? `[${d.subCategory}] ${d.description.trim()}`
      : `[${d.subCategory}] Transport expense`;

    const txn = await recordTransaction({
      direction: d.direction,
      category: 'TRANSPORT',
      amount: d.amount,
      date: new Date(d.date),
      description: finalDescription,
      unitId: 'transport',
      paymentMode: d.paymentMode,
      source: 'MANUAL',
      receiptUrl: d.receiptUrl || null,
      createdBy: a.userId,
    });

    await logAuditEvent(a.userId, 'CREATE', 'Transaction', txn.id, {
      direction: d.direction,
      category: 'TRANSPORT',
      subCategory: d.subCategory,
      amount: d.amount,
    });

    return NextResponse.json({ transaction: txn }, { status: 201 });
  } catch (error) {
    console.error('[TRANSPORT_FINANCE_POST]', error);
    return NextResponse.json({ error: 'Failed to record transport entry.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
