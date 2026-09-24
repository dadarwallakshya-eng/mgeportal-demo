/**
 * @module api/accounts/chart
 * @description Chart of Accounts — list and create ledger accounts.
 *
 * GET  — All ledger accounts for the user's units, grouped by AccountType with running balances.
 * POST — Create a new ledger account (DIRECTOR only).
 *
 * SECURITY: Accounts Ledger is DIRECTOR-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { AccountType } from '@prisma/client';

function directorGuard(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const userRole = request.headers.get('x-user-role');
  const accessUnitsRaw = request.headers.get('x-user-access-units');
  if (!userId || !accessUnitsRaw) return null;
  if (userRole !== 'DIRECTOR') return null;
  return { userId, accessUnits: JSON.parse(accessUnitsRaw) as string[] };
}

const createAccountSchema = z.object({
  accountCode: z.string().min(1, 'Account code required').max(40).trim(),
  name: z.string().min(1, 'Account name required').max(150).trim(),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  unitId: z.string().min(1, 'Division is required'),
  openingBalance: z.preprocess((v) => (v === '' || v == null ? 0 : Number(v)), z.number()).default(0),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = directorGuard(request);
    if (!auth) return NextResponse.json({ error: 'Director access required', code: 'FORBIDDEN' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const unitParam = searchParams.get('unit') || 'all';

    let targetUnits = auth.accessUnits;
    if (unitParam !== 'all') {
      if (!auth.accessUnits.includes(unitParam)) {
        return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
      }
      targetUnits = [unitParam];
    }

    const accounts = await prisma.ledgerAccount.findMany({
      where: { unitId: { in: targetUnits } },
      include: { unit: { select: { name: true } } },
      orderBy: [{ type: 'asc' }, { accountCode: 'asc' }],
    });

    // Group by account type for the UI
    const grouped: Record<string, typeof accounts> = {
      ASSET: [], LIABILITY: [], EQUITY: [], REVENUE: [], EXPENSE: [],
    };
    for (const acct of accounts) grouped[acct.type].push(acct);

    // Net totals per type
    const totals = Object.fromEntries(
      Object.entries(grouped).map(([type, accts]) => [
        type, accts.reduce((sum, a) => sum + Number(a.currentBalance), 0),
      ])
    );

    return NextResponse.json({ accounts, grouped, totals });
  } catch (error) {
    console.error('[CHART_GET]', error);
    return NextResponse.json({ error: 'Failed to load chart of accounts.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = directorGuard(request);
    if (!auth) return NextResponse.json({ error: 'Director access required', code: 'FORBIDDEN' }, { status: 403 });

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 }); }

    const validation = createAccountSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed', code: 'VALIDATION_ERROR',
        details: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }

    const d = validation.data;
    if (!auth.accessUnits.includes(d.unitId)) {
      return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
    }

    const existing = await prisma.ledgerAccount.findUnique({ where: { accountCode: d.accountCode } });
    if (existing) {
      return NextResponse.json({ error: `Account code '${d.accountCode}' already exists.`, code: 'DUPLICATE_RECORD' }, { status: 409 });
    }

    const account = await prisma.ledgerAccount.create({
      data: {
        accountCode: d.accountCode,
        name: d.name,
        type: d.type as AccountType,
        unitId: d.unitId,
        currentBalance: d.openingBalance,
      },
      include: { unit: { select: { name: true } } },
    });

    await logAuditEvent(auth.userId, 'CREATE', 'LedgerAccount', account.id, {
      accountCode: d.accountCode, name: d.name, type: d.type,
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    console.error('[CHART_POST]', error);
    return NextResponse.json({ error: 'Failed to create account.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
