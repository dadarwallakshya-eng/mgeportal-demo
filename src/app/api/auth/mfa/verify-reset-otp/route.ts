import { NextRequest, NextResponse } from 'next/server';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import prisma from '@/lib/prisma';
import { verifyMfaPendingToken } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Body may be empty if invalid JSON
    }

    const { otpCode, username } = body;

    if (!otpCode || !/^\d{6}$/.test(otpCode)) {
      return NextResponse.json({ error: 'Please enter a valid 6-digit verification code' }, { status: 400 });
    }

    let userId: string | null = null;

    if (token) {
      const payload = await verifyMfaPendingToken(token);
      if (payload) {
        userId = payload.userId;
      }
    }

    if (!userId && username) {
      const u = await prisma.user.findFirst({
        where: {
          OR: [
            { username },
            { username: `${username.replace(/@.*$/, '')}@mgportal.com` },
          ],
        },
        select: { id: true },
      });
      if (u) userId = u.id;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Valid session or username is required' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        mfaResetOtp: true,
        mfaResetOtpExpiresAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User account not found' }, { status: 404 });
    }

    if (!user.mfaResetOtp || !user.mfaResetOtpExpiresAt) {
      return NextResponse.json(
        { error: 'No active 2FA reset request found. Please click "Reset Authenticator" to request a code.' },
        { status: 400 }
      );
    }

    if (new Date() > new Date(user.mfaResetOtpExpiresAt)) {
      return NextResponse.json(
        { error: 'Verification code has expired. Please request a new verification code.' },
        { status: 400 }
      );
    }

    // Verify OTP matching
    const isValid = await bcrypt.compare(otpCode, user.mfaResetOtp);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid 6-digit verification code. Please check your email and try again.' },
        { status: 400 }
      );
    }

    // Generate brand-new TOTP secret for the user
    const secret = speakeasy.generateSecret({
      name: `MGE Portal (${user.username})`,
      issuer: 'MGE Portal',
    });

    const secretBase32 = secret.base32;
    const otpauthUrl = secret.otpauth_url || '';

    // Clear OTP fields & save new TOTP secret (keep isTotpEnabled = false until 6-digit TOTP app code is confirmed!)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecret: secretBase32,
        isTotpEnabled: false,
        mfaResetOtp: null,
        mfaResetOtpExpiresAt: null,
      },
    });

    // Generate QR code data URL
    const qrCodeUrl = await qrcode.toDataURL(otpauthUrl);

    await logAuditEvent(user.id, 'MFA_RESET_VERIFIED', 'Auth', user.id, {
      username: user.username,
      reason: 'Email OTP verified successfully for 2FA reset',
    });

    console.log(`[MFA_VERIFY_OTP] 2FA Reset verified via Email OTP for user: ${user.username}`);

    return NextResponse.json({
      success: true,
      message: 'Email OTP verified. Scan the new QR code below to configure your authenticator app.',
      qrCodeUrl,
      secret: secretBase32,
    });
  } catch (error) {
    console.error('[MFA_VERIFY_OTP] Failed to verify OTP:', error);
    return NextResponse.json(
      { error: 'Failed to verify OTP code. Please try again.' },
      { status: 500 }
    );
  }
}
