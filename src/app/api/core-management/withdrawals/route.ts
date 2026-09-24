import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const role = request.headers.get('x-user-role');

    if (!userId || !role) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const unitId = searchParams.get('unitId');

    // Query withdrawals
    const where: any = {
      direction: 'EXPENSE',
      category: 'SALARY',
      source: 'CORE_MANAGEMENT',
      isDeleted: false,
    };

    if (unitId) {
      where.unitId = unitId;
    }

    // Director can query for anyone, core management query for themselves
    if (role !== 'DIRECTOR') {
      where.createdBy = userId;
    }

    const txns = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        date: true,
        description: true,
        unitId: true,
        paymentMode: true,
      }
    });

    return NextResponse.json({ transactions: txns }, { status: 200 });
  } catch (error) {
    console.error('[CORE_WITHDRAWALS] Error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
