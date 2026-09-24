/**
 * @file src/app/api/cron/monthly-report/route.ts
 * @description Vercel-cron-triggered endpoint that emails the *previous* month's
 *              report to the configured recipient(s) on the 1st of each month.
 *
 * Schedule (vercel.json):    "30 2 1 * *"   → 02:30 UTC = 08:00 IST on the 1st
 *
 * Security:
 *   - Vercel cron requests carry `Authorization: Bearer <CRON_SECRET>` when
 *     CRON_SECRET is set in project env vars. We reject everything else.
 *   - The login-gated middleware does NOT cover /api/cron/*, so this is the
 *     only auth in front of it. The shared secret is critical.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendMonthlyReport } from '@/lib/sendMonthlyReport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // PDF + Gemini + SMTP comfortably under a minute.

/** Returns YYYY-MM for the calendar month *before* `from` (defaults to now). */
function previousMonthKey(from: Date = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Authenticate the cron caller ─────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured on the server. Refusing to run.', code: 'NO_SECRET' },
      { status: 503 }
    );
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  // Allow an explicit ?month=YYYY-MM override for backfills; default to the
  // month that just ended.
  const explicit = request.nextUrl.searchParams.get('month');
  const monthKey = explicit && /^\d{4}-\d{2}$/.test(explicit) ? explicit : previousMonthKey();

  try {
    const result = await sendMonthlyReport({ monthKey });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[CRON_MONTHLY_REPORT]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send monthly report.', code: 'SEND_FAILED' },
      { status: 500 }
    );
  }
}
