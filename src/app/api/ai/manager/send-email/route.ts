import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, isEmailConfigured } from '@/lib/email';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Verify Authorization (Director Only) ───────────────────────────────
    const role = request.headers.get('x-user-role');
    const userId = request.headers.get('x-user-id');

    if (role !== 'DIRECTOR') {
      return NextResponse.json(
        { error: 'Access denied. Only the Director can dispatch emails.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: 'Outbound email service (Gmail SMTP) is not configured in environment variables.', code: 'CONFIG_ERROR' },
        { status: 500 }
      );
    }

    const { to, subject, body } = await request.json();

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: 'Fields "to", "subject", and "body" are required.', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    // ── Dispatch Email ─────────────────────────────────────────────────────
    const htmlBody = `
      <div style="font-family: sans-serif; line-height: 1.6; color: #1d1b2a; max-width: 600px; margin: 0 auto; border: 1px solid #ece6db; border-radius: 12px; padding: 24px; background-color: #ffffff;">
        <h2 style="font-family: serif; color: #3a1577; margin-top: 0; border-b: 1px solid #ece6db; padding-bottom: 12px;">Modern Group of Education</h2>
        <div style="white-space: pre-wrap; font-size: 14.5px;">${body}</div>
        <hr style="border: 0; border-top: 1px solid #ece6db; margin: 24px 0;" />
        <p style="font-size: 11px; color: #8a8898; margin-bottom: 0;">
          This message was sent securely from the MGE Admin Portal by the Director.
        </p>
      </div>
    `;

    const result = await sendEmail({
      to,
      subject,
      html: htmlBody,
      text: body,
    });

    // ── Log Audit Event ────────────────────────────────────────────────────
    const actorId = userId || '00000000-0000-0000-0000-000000000000';
    await logAuditEvent(actorId, 'CREATE', 'EmailDispatch', actorId, {
      to,
      subject,
      messageId: result.messageId,
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });
  } catch (error: any) {
    console.error('[AI_SEND_EMAIL_API] Failed to dispatch email:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send email.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
