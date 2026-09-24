import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const CORE_MANAGEMENT_EMAILS = [
  'kamlesh2005@mgportal.com',
  'kamleshkumar@mgportal.com',
  'm8l31@mgportal.com',
  's2k75@mgportal.com',
  'transporthead@mgportal.com'
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const role = request.headers.get('x-user-role');

    if (!userId || !role) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    if (role !== 'DIRECTOR') {
      return NextResponse.json({ error: 'Access denied: Director only', code: 'FORBIDDEN' }, { status: 403 });
    }

    // Fetch the 4 users
    const users = await prisma.user.findMany({
      where: {
        username: { in: CORE_MANAGEMENT_EMAILS }
      },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        photoUrl: true,
        accessUnits: true,
      }
    });

    // Fetch all CORE_MANAGEMENT transactions
    const txns = await prisma.transaction.findMany({
      where: {
        direction: 'EXPENSE',
        category: 'SALARY',
        source: 'CORE_MANAGEMENT',
      },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        amount: true,
        date: true,
        description: true,
        unitId: true,
        createdBy: true,
      }
    });

    // Aggregate summary per user
    const userSummaries = users.map(u => {
      const userTxns = txns.filter(t => t.createdBy === u.id);
      const totalWithdrawn = userTxns.reduce((sum, t) => sum + Number(t.amount), 0);

      // Division-wise breakdown
      const breakdown: Record<string, number> = {};
      u.accessUnits.forEach(unit => {
        breakdown[unit] = userTxns
          .filter(t => t.unitId === unit)
          .reduce((sum, t) => sum + Number(t.amount), 0);
      });

      return {
        ...u,
        totalWithdrawn,
        breakdown,
        transactions: userTxns.map(t => ({
          id: t.id,
          amount: Number(t.amount),
          date: t.date,
          description: t.description,
          unitId: t.unitId,
        })),
      };
    });

    return NextResponse.json({ summaries: userSummaries }, { status: 200 });
  } catch (error) {
    console.error('[CORE_SUMMARY] Error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
