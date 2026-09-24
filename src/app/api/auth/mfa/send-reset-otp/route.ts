import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyMfaPendingToken } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { logAuditEvent } from '@/lib/audit';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 3) {
    return `${name[0]}***@${domain}`;
  }
  const start = name.substring(0, 3);
  const end = name.substring(name.length - 2);
  return `${start}***${end}@${domain}`;
}

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Empty body
    }

    const authHeader = request.headers.get('authorization');
    const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const token = rawToken && rawToken !== 'undefined' && rawToken !== 'null' ? rawToken : null;

    let userId: string | null = null;

    if (token) {
      const payload = await verifyMfaPendingToken(token);
      if (payload) {
        userId = payload.userId;
      }
    }

    const searchUsername = body.username || body.user;

    if (!userId && searchUsername) {
      const cleanUser = searchUsername.replace(/@.*$/, '');
      const u = await prisma.user.findFirst({
        where: {
          OR: [
            { username: searchUsername },
            { username: `${cleanUser}@mgportal.com` },
            { username: `${cleanUser}@mgeportal.com` },
          ],
        },
        select: { id: true },
      });
      if (u) userId = u.id;
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Username or login session is required to request 2FA reset OTP.' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, username: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User account not found' }, { status: 404 });
    }

    if (!user.email || !user.email.includes('@')) {
      return NextResponse.json(
        {
          error: `No registered personal email address found for account (${user.username}). Please ask your Director to set your registered email in User Management.`,
          code: 'NO_REGISTERED_EMAIL',
        },
        { status: 400 }
      );
    }

    // Generate a secure 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP hash and expiration
    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaResetOtp: otpHash,
        mfaResetOtpExpiresAt: expiresAt,
      },
    });

    const masked = maskEmail(user.email);

    // Construct professional HTML Email
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8f6f0; color: #1a1a2e; margin: 0; padding: 20px; }
    .container { max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e2dbcd; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
    .header { background: #3a1577; padding: 24px; text-align: center; color: #ffffff; }
    .header h1 { font-family: Georgia, serif; font-size: 20px; margin: 0; font-weight: 700; }
    .content { padding: 28px 24px; text-align: center; }
    .otp-card { background: #fdfbf7; border: 2px dashed #3a1577; border-radius: 12px; padding: 20px; margin: 20px 0; display: inline-block; }
    .otp-code { font-family: monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #3a1577; margin: 0; }
    .warning { font-size: 12px; color: #555; background: #fff8e6; border: 1px solid #ffe0b2; padding: 12px; border-radius: 8px; margin-top: 16px; text-align: left; }
    .footer { background: #faf8f5; padding: 16px; text-align: center; font-size: 11px; color: #888; border-top: 1px solid #f0ebe1; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Modern Group of Education</h1>
      <p style="font-size: 12px; opacity: 0.85; margin-top: 4px;">Security & Authenticator Device Reset</p>
    </div>
    <div class="content">
      <h2 style="font-size: 18px; margin-top: 0; color: #1a1a2e;">2FA Verification Code</h2>
      <p style="font-size: 13px; color: #555;">Hello <strong>${user.name}</strong>,</p>
      <p style="font-size: 13px; color: #555;">A request was made to reset the 2-Step Verification (2FA) authenticator for your portal account (<code>${user.username}</code>).</p>
      
      <div class="otp-card">
        <p style="font-size: 11px; text-transform: uppercase; color: #888; margin: 0 0 6px 0; font-weight: bold;">Verification Code (6 Digits)</p>
        <div class="otp-code">${otpCode}</div>
      </div>
      
      <div class="warning">
        <strong>⚠️ Security Instructions:</strong>
        <ul style="margin: 6px 0 0 0; padding-left: 18px;">
          <li>This code is valid for <strong>10 minutes</strong>.</li>
          <li>Do NOT share this code with anyone.</li>
          <li>Enter this code on the portal login screen to register your new authenticator device.</li>
        </ul>
      </div>
    </div>
    <div class="footer">
      Modern Group of Education · Kuchaman City, Rajasthan<br>
      Automated Security Notification · Do Not Reply
    </div>
  </div>
</body>
</html>
    `;

    const textBody = `Hello ${user.name},\n\nYour 2FA reset verification code is: ${otpCode}\n\nThis code is valid for 10 minutes. Do not share this code with anyone.`;

    await sendEmail({
      to: user.email,
      subject: `MGE Portal — 2FA Security Reset Code: ${otpCode}`,
      html: htmlBody,
      text: textBody,
    });

    await logAuditEvent(user.id, 'MFA_RESET_OTP_SENT', 'Auth', user.id, {
      email: masked,
    });

    console.log(`[MFA_SEND_OTP] 2FA Reset OTP sent to ${masked} for user ${user.username}`);

    return NextResponse.json({
      success: true,
      message: `A 6-digit verification code has been sent to your registered email address (${masked}).`,
      maskedEmail: masked,
    });
  } catch (error: any) {
    console.error('[MFA_SEND_OTP] Failed to send OTP:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send verification email. Please try again.' },
      { status: 500 }
    );
  }
}
