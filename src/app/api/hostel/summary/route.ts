/**
 * @module api/hostel/summary
 * @description Hostel dashboard aggregates (live).
 *
 * Returns:
 *  - students: total residents, how many fully paid / pending, total charged / paid / outstanding
 *  - dailyUse: total daily-use money given, plus per-student breakdown
 *  - money: total hostel income, total hostel expense, net balance (all from the Transaction table)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hostelGuard } from '@/lib/hostelAuth';
import { getResidentAccount } from '@/lib/hostel';
import { getFinanceSummary } from '@/lib/finance';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = hostelGuard(request);
    if (!auth) return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });

    const residents = await prisma.hostelResident.findMany({
      where: { status: 'ACTIVE' },
      include: { student: { select: { id: true, name: true, admissionNo: true, className: true } } },
    });

    let totalCharged = 0, totalPaid = 0, fullyPaid = 0, pending = 0, totalDailyUse = 0;
    const studentRows: {
      id: string; name: string; admissionNo: string; className: string;
      netFee: number; totalCharged: number; paid: number; balanceDue: number; dailyUseGiven: number;
    }[] = [];

    for (const r of residents) {
      const acct = await getResidentAccount(
        r.studentId, 
        Number(r.annualFee), 
        r.discountType, 
        Number(r.discountValue), 
        Number(r.previousOutstanding || 0)
      );
      totalCharged += acct.totalCharged;
      totalPaid += acct.paid;
      totalDailyUse += acct.dailyUseGiven;
      if (acct.balanceDue <= 0 && acct.totalCharged > 0) fullyPaid++; else if (acct.balanceDue > 0) pending++;
      studentRows.push({
        id: r.student.id, name: r.student.name, admissionNo: r.student.admissionNo, className: r.student.className,
        netFee: acct.netFee, totalCharged: acct.totalCharged, paid: acct.paid, balanceDue: acct.balanceDue, dailyUseGiven: acct.dailyUseGiven,
      });
    }

    // Money summary for the hostel unit only
    const money = await getFinanceSummary({ units: ['hostel'] });

    return NextResponse.json({
      students: {
        totalResidents: residents.length,
        fullyPaid, pending,
        totalCharged: Math.round(totalCharged * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        outstanding: Math.round((totalCharged - totalPaid) * 100) / 100,
        rows: studentRows.sort((a, b) => b.balanceDue - a.balanceDue),
      },
      dailyUse: {
        total: Math.round(totalDailyUse * 100) / 100,
        rows: studentRows.filter(s => s.dailyUseGiven > 0).map(s => ({ id: s.id, name: s.name, admissionNo: s.admissionNo, given: s.dailyUseGiven })),
      },
      money,
    });
  } catch (error) {
    console.error('[HOSTEL_SUMMARY_GET]', error);
    return NextResponse.json({ error: 'Failed to load hostel summary.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
