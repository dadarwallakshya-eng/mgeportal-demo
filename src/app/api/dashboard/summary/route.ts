/**
 * @module api/dashboard/summary
 * @description Computes real dashboard statistics from Supabase database.
 *
 * SECURITY DECISIONS:
 * - GET only: Read-only statistic aggregation.
 * - Enforces authentication by verifying middleware-injected headers.
 * - Restricts scope to only user-permitted divisions/units (accessUnits claim).
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getFinanceSummary } from '@/lib/finance';
import { loadMonthlySummary } from '@/lib/monthlyReport';
import { StaffType, FeeStatus } from '@prisma/client';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Verify authentication ─────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    // ── Parse query parameters ────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const unitParam = searchParams.get('unit') || 'all';

    // RBAC: Validate that the user is allowed to access the requested unit
    let targetUnits = accessUnits;
    if (unitParam !== 'all') {
      if (!accessUnits.includes(unitParam)) {
        return NextResponse.json(
          { error: 'Access denied for this division', code: 'FORBIDDEN' },
          { status: 403 }
        );
      }
      targetUnits = [unitParam];
    }

    // ── Query Database Concurrently (In Parallel) ───────────────────────────
    const hasHostelAccess = targetUnits.includes('hostel') || unitParam === 'all';

    const [
      totalStudents,
      totalTeachers,
      totalDrivers,
      activeBuses,
      hostelRooms,
      feePaymentsAggregate,
      finance,
      summary,
      allocations,
      studentGroups,
      rawTransactions
    ] = await Promise.all([
      // 1. Total Students Count
      prisma.student.count({
        where: {
          unitId: { in: targetUnits },
          status: 'ACTIVE',
        },
      }),

      // 2. Teachers Count (Only units that employ teachers)
      prisma.staff.count({
        where: {
          unitId: { in: targetUnits },
          staffType: StaffType.TEACHER,
          status: 'ACTIVE',
        },
      }),

      // 3. Drivers Count (Only transport division employs drivers)
      prisma.staff.count({
        where: {
          unitId: { in: targetUnits },
          staffType: StaffType.DRIVER,
          status: 'ACTIVE',
        },
      }),

      // 4. Active Buses Count
      prisma.bus.count({
        where: {
          driver: {
            unitId: { in: targetUnits },
          },
        },
      }),

      // 5. Hostel Rooms Count
      hasHostelAccess ? prisma.hostelRoom.count() : Promise.resolve(0),

      // 6. Total Revenue (Sum of Fee Payments)
      prisma.feePayment.aggregate({
        where: {
          student: {
            unitId: { in: targetUnits },
          },
        },
        _sum: {
          totalAmount: true,
        },
      }),

      // 7. Live income / expense / net balance from the simple money system
      getFinanceSummary({ units: targetUnits, includeNullUnit: true }),

      // 8. Financial Summary (Revenue trends - last 6 months)
      loadMonthlySummary(targetUnits, 6),

      // 9. Fee Collection vs Outstanding Dues (applying discount factor per component)
      prisma.feeAllocation.findMany({
        where: {
          student: {
            unitId: { in: targetUnits },
            status: 'ACTIVE',
          },
        },
        include: {
          student: {
            select: {
              id: true,
              concessions: {
                select: {
                  feeComponentName: true,
                  discountType: true,
                  value: true,
                },
              },
            },
          },
          feeComponent: {
            select: {
              name: true,
            },
          },
        },
      }),

      // 10. Student distribution count across academic divisions
      prisma.student.groupBy({
        by: ['unitId'],
        _count: { id: true },
        where: {
          unitId: { in: targetUnits },
          status: 'ACTIVE',
        },
      }),

      // 11. Recent transactions (latest 10)
      prisma.transaction.findMany({
        where: {
          isDeleted: false,
          OR: [
            { unitId: { in: targetUnits } },
            { unitId: null },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          unit: { select: { name: true } },
          student: { select: { name: true, admissionNo: true } },
          staff: { select: { name: true } },
        },
      }),
    ]);

    const totalRevenue = Number(feePaymentsAggregate._sum.totalAmount || 0);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const revenueData = [...summary].reverse().map(item => {
      const parts = item.monthKey.split('-');
      const monthIndex = parseInt(parts[1], 10) - 1;
      const name = monthNames[monthIndex] || parts[1];
      return {
        name,
        revenue: item.income,
        expenses: item.expense,
      };
    });

    let totalCollected = 0;
    let totalOutstanding = 0;

    for (const alloc of allocations) {
      const concessions = alloc.student.concessions;
      const componentName = alloc.feeComponent.name;
      const conc = concessions.find(c => c.feeComponentName === componentName);
      const due = Number(alloc.amountDue);
      const paid = Number(alloc.amountPaid);
      let netDue = due;
      if (conc) {
        if (conc.discountType === 'FIXED_AMOUNT') {
          netDue = Math.max(0, due - Number(conc.value));
        } else {
          netDue = due * (1 - Number(conc.value) / 100);
        }
      }
      const outstanding = Math.max(0, netDue - paid);

      totalCollected += paid;
      totalOutstanding += outstanding;
    }

    const feeCollection = [
      { name: 'Collected', value: totalCollected, color: '#10b981' },
      { name: 'Outstanding', value: totalOutstanding, color: '#f59e0b' },
    ];

    const UNIT_MAP: Record<string, { name: string; fill: string }> = {
      hindi: { name: 'Hindi Medium', fill: '#6366f1' },
      english: { name: 'English Medium', fill: '#3b82f6' },
      college: { name: 'College', fill: '#10b981' },
    };

    const distributionMap: Record<string, number> = {};
    for (const u of targetUnits) {
      if (UNIT_MAP[u]) {
        distributionMap[u] = 0;
      }
    }

    for (const group of studentGroups) {
      if (group.unitId in distributionMap) {
        distributionMap[group.unitId] = group._count.id;
      }
    }

    const studentDistribution = Object.entries(distributionMap).map(([unitId, count]) => {
      const info = UNIT_MAP[unitId];
      return {
        name: info.name,
        students: count,
        fill: info.fill,
      };
    });

    const transactions = rawTransactions.map(tx => {
      const voucherNo = tx.referenceNo || `TX-${tx.id.slice(0, 8).toUpperCase()}`;
      const type = tx.direction === 'INCOME' ? 'credit' : 'debit';
      const date = tx.date.toISOString().slice(0, 10);
      const unit = tx.unit?.name || 'General';
      return {
        id: tx.id,
        voucherNo,
        date,
        description: tx.description || `${tx.category} Transaction`,
        amount: Number(tx.amount),
        type,
        unit,
      };
    });

    return NextResponse.json({
      stats: {
        totalStudents,
        totalTeachers,
        totalDrivers,
        totalRevenue,
        activeBuses,
        hostelRooms,
        totalIncome: finance.totalIncome,
        totalExpense: finance.totalExpense,
        netBalance: finance.net,
      },
      revenueData,
      feeCollection,
      studentDistribution,
      transactions,
    });
  } catch (error) {
    console.error('[DASHBOARD_SUMMARY] Internal error:', error);
    return NextResponse.json(
      { error: 'An error occurred while compiling statistics.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
