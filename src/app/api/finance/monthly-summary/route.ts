/**
 * @file src/app/api/finance/monthly-summary/route.ts
 * @description GET /api/finance/monthly-summary?months=12
 *              Returns income/expense/net totals for the last N months.
 *              Lightweight aggregate — does not include the per-row transactions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadMonthlySummary } from '@/lib/monthlyReport';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const accessUnitsRaw = request.headers.get('x-user-access-units');
    const userId = request.headers.get('x-user-id');
    if (!userId || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    const monthsBack = Math.max(1, Math.min(36, parseInt(request.nextUrl.searchParams.get('months') || '12')));

    const summary = await loadMonthlySummary(accessUnits, monthsBack);
    return NextResponse.json({ summary });
  } catch (error) {
    console.error('[FINANCE_MONTHLY_SUMMARY_GET]', error);
    return NextResponse.json({ error: 'Failed to load monthly summary.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
