/**
 * @file src/app/api/finance/send-report/route.ts
 * @description Manually trigger the monthly report email for any month.
 *
 *   POST /api/finance/send-report?month=YYYY-MM
 *
 * Role: DIRECTOR or PRINCIPAL only (matches who else gets to manage finances).
 * Same internals as the cron — calls sendMonthlyReport — so behaviour is identical.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendMonthlyReport } from '@/lib/sendMonthlyReport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role') || '';
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (role !== 'DIRECTOR') {
    return NextResponse.json(
      { error: 'Only Directors can send reports manually.', code: 'FORBIDDEN_ROLE' },
      { status: 403 }
    );
  }

  const month = request.nextUrl.searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month=YYYY-MM is required.', code: 'BAD_PARAM' }, { status: 400 });
  }

  // Body is optional — operator can override the env-configured recipient list.
  let recipients: string[] | undefined;
  let cc: string[] | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body?.recipients) && body.recipients.every((s: unknown) => typeof s === 'string')) {
      recipients = body.recipients;
    }
    if (Array.isArray(body?.cc) && body.cc.every((s: unknown) => typeof s === 'string')) {
      cc = body.cc;
    }
  } catch { /* no body / not JSON */ }

  try {
    const result = await sendMonthlyReport({ monthKey: month, recipients, cc });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[FINANCE_SEND_REPORT]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send report.', code: 'SEND_FAILED' },
      { status: 500 }
    );
  }
}
