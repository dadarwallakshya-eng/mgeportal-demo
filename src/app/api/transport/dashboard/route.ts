import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { BusStatus, StaffStatus, StudentStatus, TransportMode } from '@prisma/client';

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

    if (!a.accessUnits.includes('transport')) {
      return NextResponse.json({ error: 'Access denied for transport division', code: 'FORBIDDEN' }, { status: 403 });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Run aggregations sequentially (safe for PgBouncer transaction mode)
    const totalStations = await prisma.busStation.count({
      where: { isActive: true },
    });

    const activeBuses = await prisma.bus.count({
      where: { status: BusStatus.ACTIVE },
    });

    const totalRiders = await prisma.student.count({
      where: { transportMode: TransportMode.BUS_SERVICE, status: StudentStatus.ACTIVE },
    });

    const activeDrivers = await prisma.staff.count({
      where: { staffType: 'DRIVER', status: StaffStatus.ACTIVE },
    });

    // Sum monthly income for unit 'transport' (budget transfers) + division-side allocations
    const incomeAgg = await prisma.transaction.aggregate({
      where: {
        OR: [
          { unitId: 'transport', direction: 'INCOME' },
          { category: 'TRANSPORT', direction: 'EXPENSE', unitId: { in: ['english', 'college', 'hindi'] } }
        ],
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { amount: true },
    });
    const monthlyIncome = Number(incomeAgg._sum.amount || 0);

    // Sum monthly expense for unit 'transport' (fuel, maintenance, driver salaries)
    const expenseAgg = await prisma.transaction.aggregate({
      where: {
        unitId: 'transport',
        direction: 'EXPENSE',
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { amount: true },
    });
    const monthlyExpense = Number(expenseAgg._sum.amount || 0);

    // Calculate 6-month historical trend
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      const mEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);
      const mLabel = targetDate.toLocaleString('en-IN', { month: 'short', year: '2-digit' });

      const mIncomeAgg = await prisma.transaction.aggregate({
        where: {
          OR: [
            { unitId: 'transport', direction: 'INCOME' },
            { category: 'TRANSPORT', direction: 'EXPENSE', unitId: { in: ['english', 'college', 'hindi'] } }
          ],
          date: { gte: mStart, lte: mEnd },
        },
        _sum: { amount: true },
      });
      const mExpenseAgg = await prisma.transaction.aggregate({
        where: { unitId: 'transport', direction: 'EXPENSE', date: { gte: mStart, lte: mEnd } },
        _sum: { amount: true },
      });

      trend.push({
        label: mLabel,
        income: Number(mIncomeAgg._sum.amount || 0),
        expense: Number(mExpenseAgg._sum.amount || 0),
        net: Number(mIncomeAgg._sum.amount || 0) - Number(mExpenseAgg._sum.amount || 0),
      });
    }

    return NextResponse.json({
      metrics: {
        totalStations,
        activeBuses,
        totalRiders,
        activeDrivers,
        monthlyIncome,
        monthlyExpense,
        netCashFlow: monthlyIncome - monthlyExpense,
      },
      trend,
    });
  } catch (error) {
    console.error('[TRANSPORT_DASHBOARD_GET]', error);
    return NextResponse.json({ error: 'Failed to load transport dashboard details.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
