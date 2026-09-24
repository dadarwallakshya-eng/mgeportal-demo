/**
 * @file src/app/api/finance/export/route.ts
 * @description GET /api/finance/export?month=YYYY-MM&format=xlsx|pdf
 *
 * Streams either an Excel workbook or a PDF report for the given month.
 * Same RBAC as the rest of /api/finance — only transactions in units the
 * operator can access (plus null-unit rows) are included.
 *
 * Heavy imports (exceljs, @react-pdf/renderer) are required dynamically so
 * the route's cold-start only loads the format the caller actually asked for.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadMonthlyReport } from '@/lib/monthlyReport';

export const runtime = 'nodejs';        // PDF generation needs Node APIs.
export const dynamic = 'force-dynamic'; // Never cache exports — they reflect live data.

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  try {
    const userId = request.headers.get('x-user-id');
    const accessUnitsRaw = request.headers.get('x-user-access-units');
    if (!userId || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    const sp = request.nextUrl.searchParams;
    const month = sp.get('month');
    const format = (sp.get('format') || 'xlsx').toLowerCase();

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month=YYYY-MM is required.', code: 'BAD_PARAM' }, { status: 400 });
    }
    if (!['xlsx', 'pdf'].includes(format)) {
      return NextResponse.json({ error: 'format must be xlsx or pdf.', code: 'BAD_PARAM' }, { status: 400 });
    }

    const report = await loadMonthlyReport(month, accessUnits);
    const safeMonth = month.replace('-', '_');

    if (format === 'xlsx') {
      const { buildMonthlyExcel } = await import('@/lib/reportExcel');
      const buf = await buildMonthlyExcel(report);
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="MGE_Monthly_Report_${safeMonth}.xlsx"`,
          'Content-Length': String(buf.length),
        },
      });
    }

    // format === 'pdf'
    const { buildMonthlyPdf } = await import('@/lib/reportPdf');
    const buf = await buildMonthlyPdf(report, null /* AI summary added in Phase 4 */);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="MGE_Monthly_Report_${safeMonth}.pdf"`,
        'Content-Length': String(buf.length),
      },
    });
  } catch (error) {
    console.error('[FINANCE_EXPORT_GET]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate report.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
