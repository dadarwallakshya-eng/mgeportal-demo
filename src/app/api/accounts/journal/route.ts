/**
 * @module api/accounts/journal
 * @description Journal Entries — list all double-entry vouchers, and post manual entries.
 *
 * GET  — Paginated journal entries (with legs + account names + creator), filtered by unit/date.
 * POST — Post a manual, balanced journal entry (DIRECTOR only). Enforces debits == credits
 *        and updates each affected ledger account's running balance per accounting normal sides.
 *
 * BALANCE RULE applied to running balances:
 *   ASSET / EXPENSE accounts increase on DEBIT, decrease on CREDIT.
 *   LIABILITY / EQUITY / REVENUE accounts increase on CREDIT, decrease on DEBIT.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { LegType, AccountType } from '@prisma/client';

function directorGuard(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const userRole = request.headers.get('x-user-role');
  const accessUnitsRaw = request.headers.get('x-user-access-units');
  if (!userId || !accessUnitsRaw) return null;
  if (userRole !== 'DIRECTOR') return null;
  return { userId, accessUnits: JSON.parse(accessUnitsRaw) as string[] };
}

const manualEntrySchema = z.object({
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  description: z.string().min(1, 'Narration is required').max(500).trim(),
  legs: z.array(z.object({
    ledgerAccountId: z.string().min(1, 'Account is required'),
    type: z.enum(['DEBIT', 'CREDIT']),
    amount: z.preprocess(Number, z.number().positive('Amount must be positive')),
  })).min(2, 'A journal entry needs at least 2 legs'),
}).superRefine((data, ctx) => {
  const debits = data.legs.filter(l => l.type === 'DEBIT').reduce((s, l) => s + l.amount, 0);
  const credits = data.legs.filter(l => l.type === 'CREDIT').reduce((s, l) => s + l.amount, 0);
  if (Math.round(debits * 100) !== Math.round(credits * 100)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Total debits (₹${debits.toLocaleString('en-IN')}) must equal total credits (₹${credits.toLocaleString('en-IN')})`,
      path: ['legs'],
    });
  }
});

// Whether a DEBIT increases the balance for this account type
function debitIncreases(type: AccountType): boolean {
  return type === 'ASSET' || type === 'EXPENSE';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = directorGuard(request);
    if (!auth) return NextResponse.json({ error: 'Director access required', code: 'FORBIDDEN' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const unitParam = searchParams.get('unit') || 'all';
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const searchQuery = searchParams.get('search')?.trim() || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(50, parseInt(searchParams.get('limit') || '20')));
    const skip = (page - 1) * limit;

    let targetUnits = auth.accessUnits;
    if (unitParam !== 'all') {
      if (!auth.accessUnits.includes(unitParam)) {
        return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
      }
      targetUnits = [unitParam];
    }

    const dateFilter: Record<string, Date> = {};
    if (fromDate) dateFilter.gte = new Date(fromDate);
    if (toDate) { const t = new Date(toDate); t.setHours(23, 59, 59, 999); dateFilter.lte = t; }

    const where: any = {
      // Only entries that touch an account in the user's units
      transactionLegs: { some: { ledgerAccount: { unitId: { in: targetUnits } } } },
      ...(Object.keys(dateFilter).length ? { transactionDate: dateFilter } : {}),
      ...(searchQuery ? {
        OR: [
          { voucherNo: { contains: searchQuery, mode: 'insensitive' } },
          { description: { contains: searchQuery, mode: 'insensitive' } },
        ],
      } : {}),
    };

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          creator: { select: { name: true } },
          transactionLegs: {
            include: { ledgerAccount: { select: { name: true, accountCode: true, type: true } } },
          },
        },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.journalEntry.count({ where }),
    ]);

    return NextResponse.json({
      entries,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[JOURNAL_GET]', error);
    return NextResponse.json({ error: 'Failed to load journal entries.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = directorGuard(request);
    if (!auth) return NextResponse.json({ error: 'Director access required', code: 'FORBIDDEN' }, { status: 403 });

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 }); }

    const validation = manualEntrySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed', code: 'VALIDATION_ERROR',
        details: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }

    const d = validation.data;

    // Load all referenced accounts & verify RBAC + existence
    const accountIds = [...new Set(d.legs.map(l => l.ledgerAccountId))];
    const accounts = await prisma.ledgerAccount.findMany({ where: { id: { in: accountIds } } });

    if (accounts.length !== accountIds.length) {
      return NextResponse.json({ error: 'One or more ledger accounts not found.', code: 'NOT_FOUND' }, { status: 404 });
    }
    for (const acct of accounts) {
      if (!auth.accessUnits.includes(acct.unitId)) {
        return NextResponse.json({ error: `Access denied for account ${acct.accountCode}.`, code: 'FORBIDDEN' }, { status: 403 });
      }
    }
    const acctMap = new Map(accounts.map(a => [a.id, a]));

    // Voucher number
    const year = new Date(d.transactionDate).getFullYear();
    const highestJE = await prisma.journalEntry.findFirst({
      where: { voucherNo: { startsWith: `JE-MAN-${year}-` } },
      orderBy: { voucherNo: 'desc' },
      select: { voucherNo: true }
    });
    let nextNo = 1;
    if (highestJE) {
      const parts = highestJE.voucherNo.split('-');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) {
        nextNo = lastNum + 1;
      }
    }
    const voucherNo = `JE-MAN-${year}-${String(nextNo).padStart(5, '0')}`;

    // Create entry + legs
    const entry = await prisma.journalEntry.create({
      data: {
        transactionDate: new Date(d.transactionDate),
        description: d.description,
        voucherNo,
        createdBy: auth.userId,
        transactionLegs: {
          create: d.legs.map(l => ({
            ledgerAccountId: l.ledgerAccountId,
            type: l.type as LegType,
            amount: l.amount,
          })),
        },
      },
      include: {
        transactionLegs: { include: { ledgerAccount: { select: { name: true, accountCode: true, type: true } } } },
        creator: { select: { name: true } },
      },
    });

    // Update running balances per normal-side rules
    for (const leg of d.legs) {
      const acct = acctMap.get(leg.ledgerAccountId)!;
      const increases =
        (leg.type === 'DEBIT' && debitIncreases(acct.type)) ||
        (leg.type === 'CREDIT' && !debitIncreases(acct.type));
      await prisma.ledgerAccount.update({
        where: { id: leg.ledgerAccountId },
        data: { currentBalance: increases ? { increment: leg.amount } : { decrement: leg.amount } },
      });
    }

    await logAuditEvent(auth.userId, 'CREATE', 'JournalEntry', entry.id, {
      voucherNo, description: d.description, legCount: d.legs.length,
    });

    return NextResponse.json({ entry, voucherNo }, { status: 201 });
  } catch (error) {
    console.error('[JOURNAL_POST]', error);
    return NextResponse.json({ error: 'Failed to post journal entry.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
