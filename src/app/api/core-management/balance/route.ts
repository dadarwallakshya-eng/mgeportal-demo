import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getFinanceSummary } from '@/lib/finance';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    const { searchParams } = new URL(request.url);
    const unitId = searchParams.get('unitId');

    if (!unitId) {
      return NextResponse.json({ error: 'unitId parameter is required', code: 'BAD_REQUEST' }, { status: 400 });
    }

    // Verify user has access to the requested division
    if (!accessUnits.includes(unitId)) {
      return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
    }

    const summary = await getFinanceSummary({ units: [unitId], includeNullUnit: false });

    return NextResponse.json({ balance: summary.net }, { status: 200 });
  } catch (error) {
    console.error('[CORE_BALANCE] Error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
