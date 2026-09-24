/**
 * @module api/accounts/trial-balance
 * @description Trial Balance — sums every posted transaction leg per account into DEBIT/CREDIT columns.
 *
 * For each ledger account, sum its DEBIT legs and CREDIT legs across all journal entries.
 * Each account appears in whichever column reflects its net position. A correct double-entry
 * system always yields total debits == total credits.
 *
 * SECURITY: DIRECTOR only.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function directorGuard(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const userRole = request.headers.get('x-user-role');
  const accessUnitsRaw = request.headers.get('x-user-access-units');
  if (!userId || !accessUnitsRaw) return null;
  if (userRole !== 'DIRECTOR') return null;
  return { userId, accessUnits: JSON.parse(accessUnitsRaw) as string[] };
}

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

    // Pull all accounts in scope, with their legs
    const accounts = await prisma.ledgerAccount.findMany({
      where: { unitId: { in: targetUnits } },
      include: {
        transactionLegs: { select: { type: true, amount: true } },
        unit: { select: { name: true } },
      },
      orderBy: [{ type: 'asc' }, { accountCode: 'asc' }],
    });

    const rows = accounts.map(acct => {
      const debitSum = acct.transactionLegs
        .filter(l => l.type === 'DEBIT')
        .reduce((s, l) => s + Number(l.amount), 0);
      const creditSum = acct.transactionLegs
        .filter(l => l.type === 'CREDIT')
        .reduce((s, l) => s + Number(l.amount), 0);

      // Net position: positive net-debit goes in the debit column, else credit column
      const net = debitSum - creditSum;
      return {
        id: acct.id,
        accountCode: acct.accountCode,
        name: acct.name,
        type: acct.type,
        unitName: acct.unit.name,
        debit: net > 0 ? net : 0,
        credit: net < 0 ? -net : 0,
        rawDebit: debitSum,
        rawCredit: creditSum,
      };
    }).filter(r => r.rawDebit !== 0 || r.rawCredit !== 0); // only accounts with activity

    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    const isBalanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

    return NextResponse.json({
      rows,
      totals: { totalDebit, totalCredit, isBalanced },
    });
  } catch (error) {
    console.error('[TRIAL_BALANCE_GET]', error);
    return NextResponse.json({ error: 'Failed to compute trial balance.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
