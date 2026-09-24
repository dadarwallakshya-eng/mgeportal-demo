import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getFinanceSummary, recordTransaction } from '@/lib/finance';
import { logAuditEvent } from '@/lib/audit';
import { PaymentMode, TxnDirection, TxnCategory } from '@prisma/client';

const CORE_MANAGEMENT_EMAILS = [
  'kamlesh2005@mgportal.com',
  'kamleshkumar@mgportal.com',
  'm8l31@mgportal.com',
  's2k75@mgportal.com',
  'transporthead@mgportal.com'
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const username = request.headers.get('x-user-username');
    const name = request.headers.get('x-user-name');
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !username || !name || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    // Enforce that only the 4 core management accounts can withdraw
    if (!CORE_MANAGEMENT_EMAILS.includes(username)) {
      return NextResponse.json({ error: 'Access denied: not a Core Management user', code: 'FORBIDDEN' }, { status: 403 });
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid json body', code: 'BAD_REQUEST' }, { status: 400 });
    }

    const { amount: amountInput, unitId, description: customDesc, date: dateInput } = body;
    const amount = Number(amountInput);

    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number', code: 'BAD_REQUEST' }, { status: 400 });
    }

    if (!unitId) {
      return NextResponse.json({ error: 'unitId is required', code: 'BAD_REQUEST' }, { status: 400 });
    }

    if (!accessUnits.includes(unitId)) {
      return NextResponse.json({ error: 'Access denied for the selected division', code: 'FORBIDDEN' }, { status: 403 });
    }

    // Check balance
    const summary = await getFinanceSummary({ units: [unitId], includeNullUnit: false });
    if (amount > summary.net) {
      return NextResponse.json({ error: `Insufficient funds in this division. Available: ₹${summary.net.toLocaleString('en-IN')}`, code: 'INSUFFICIENT_FUNDS' }, { status: 400 });
    }

    const descNote = customDesc && String(customDesc).trim() ? customDesc.trim() : 'Personal Salary Advance';

    let txDate = new Date();
    if (dateInput) {
      const parsedDate = new Date(dateInput);
      if (!isNaN(parsedDate.getTime())) {
        txDate = parsedDate;
      }
    }

    // Record transaction
    const txn = await recordTransaction({
      direction: TxnDirection.EXPENSE,
      category: TxnCategory.SALARY,
      amount,
      date: txDate,
      description: `Salary (${name}) - ${descNote}`,
      unitId,
      paymentMode: PaymentMode.CASH,
      source: 'CORE_MANAGEMENT',
      createdBy: userId,
    });

    // Audit every cash withdrawal — money movement must be traceable to a user.
    await logAuditEvent(userId, 'CREATE', 'CoreWithdrawal', txn.id, {
      name, unitId, amount, source: 'CORE_MANAGEMENT',
    });

    return NextResponse.json({ success: true, transactionId: txn.id, amount, unitId }, { status: 200 });
  } catch (error) {
    console.error('[CORE_WITHDRAW] Error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
