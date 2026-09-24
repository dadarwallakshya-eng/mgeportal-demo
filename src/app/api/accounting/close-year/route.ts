/**
 * @module api/accounting/close-year
 * @description 1-Click March 31 Financial Year Closing Engine.
 * Rolls uncollected student fee dues into previousOutstanding and locks Ind AS session ledger.
 * Strictly guarded for DIRECTOR role.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { TxnDirection } from '@prisma/client';

function directorAuthGuard(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const userRole = request.headers.get('x-user-role');

  if (!userId || userRole !== 'DIRECTOR') {
    return null;
  }
  return { userId, userRole };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = directorAuthGuard(request);
  if (!auth) {
    return NextResponse.json(
      { error: 'Director access required', code: 'FORBIDDEN' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const sessionCode = body.sessionCode || 'FY2025-26';

    const startYear = parseInt(sessionCode.replace(/\D/g, '').slice(0, 4)) || 2025;
    const fyStartDate = new Date(`${startYear}-04-01T00:00:00.000Z`);
    const fyEndDate = new Date(`${startYear + 1}-03-31T23:59:59.999Z`);

    const txns = await prisma.transaction.findMany({
      where: {
        date: {
          gte: fyStartDate,
          lte: fyEndDate,
        },
      },
      select: { amount: true, direction: true },
    });

    let grossRevenue = 0;
    let grossExpense = 0;

    txns.forEach((t) => {
      const amt = Number(t.amount) || 0;
      if (t.direction === TxnDirection.INCOME) grossRevenue += amt;
      else grossExpense += amt;
    });

    const netSurplus = grossRevenue - grossExpense;

    // Fetch Unpaid Fee Allocations
    const unpaidAllocations = await prisma.feeAllocation.findMany({
      where: {
        status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
      },
      select: {
        id: true,
        studentId: true,
        amountDue: true,
        amountPaid: true,
      },
    });

    let totalRolledReceivables = 0;

    const fiscalYearRecord = await prisma.fiscalYear.upsert({
      where: { code: sessionCode },
      update: {
        grossRevenue,
        grossExpense,
        netSurplus,
        isClosed: true,
        closedAt: new Date(),
        closedBy: auth.userId,
      },
      create: {
        code: sessionCode,
        startDate: fyStartDate,
        endDate: fyEndDate,
        grossRevenue,
        grossExpense,
        netSurplus,
        isClosed: true,
        closedAt: new Date(),
        closedBy: auth.userId,
      },
    });

    for (const alloc of unpaidAllocations) {
      const due = Number(alloc.amountDue) || 0;
      const paid = Number(alloc.amountPaid) || 0;
      const remaining = Math.max(0, due - paid);

      if (remaining > 0) {
        totalRolledReceivables += remaining;

        const resident = await prisma.hostelResident.findUnique({
          where: { studentId: alloc.studentId },
        });

        if (resident) {
          await prisma.hostelResident.update({
            where: { studentId: alloc.studentId },
            data: {
              previousOutstanding: Number(resident.previousOutstanding || 0) + remaining,
            },
          });
        }

        await prisma.fiscalYearClosingLog.create({
          data: {
            fiscalYearId: fiscalYearRecord.id,
            unitId: 'all',
            studentId: alloc.studentId,
            type: 'RECEIVABLE_ROLLOVER',
            amount: remaining,
            description: `Rolled fee allocation ${alloc.id} pending ₹${remaining} for session ${sessionCode}`,
          },
        });
      }
    }

    await prisma.fiscalYear.update({
      where: { id: fiscalYearRecord.id },
      data: {
        totalReceivables: totalRolledReceivables,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Financial Year ${sessionCode} closed successfully on 31 March.`,
      summary: {
        sessionCode,
        grossRevenue,
        grossExpense,
        netSurplus,
        allocationsRolledCount: unpaidAllocations.length,
        totalRolledReceivables,
      },
    });
  } catch (error: any) {
    console.error('Error closing financial year:', error);
    return NextResponse.json(
      { error: 'Failed to close financial year', details: error.message },
      { status: 500 }
    );
  }
}
