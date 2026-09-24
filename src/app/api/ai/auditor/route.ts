import { NextRequest, NextResponse } from 'next/server';
import { runDeepAudit, raiseAlert } from '@/lib/anomalyAgent';

export async function GET(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role');
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const isDirector = role === 'DIRECTOR';
    
    if (!isDirector && !isCron) {
      return NextResponse.json({ error: 'Access denied.', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const isTest = searchParams.get('test') === 'true';

    if (isTest) {
      await raiseAlert(
        'SECURITY',
        'INFO',
        'Test Alerts Gateway Connection',
        'This is a test security alert to verify that TextMeBot WhatsApp alerts are successfully working on your portal!'
      );
      return NextResponse.json({ success: true, message: 'Test alert sent successfully.' });
    }

    await runDeepAudit();

    return NextResponse.json({ success: true, message: 'Deep audit scan completed successfully.' });
  } catch (error: any) {
    console.error('[AI_AUDITOR_ROUTE_ERROR]', error);
    return NextResponse.json({ error: error.message || 'Audit failed', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
