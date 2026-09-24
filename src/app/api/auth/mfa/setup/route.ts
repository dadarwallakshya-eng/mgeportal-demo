import { NextRequest, NextResponse } from 'next/server';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import prisma from '@/lib/prisma';
import { verifyMfaPendingToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      return NextResponse.json({ error: 'MFA pending token is required' }, { status: 401 });
    }

    const payload = await verifyMfaPendingToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'MFA token is invalid or expired' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, username: true, totpSecret: true, isTotpEnabled: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If TOTP is already fully setup and verified, do not allow generating a new one
    // unless they are resetting it (which would be a dashboard profile action).
    if (user.isTotpEnabled && user.totpSecret) {
      return NextResponse.json({ error: 'MFA is already configured for this user' }, { status: 400 });
    }

    let secretBase32 = user.totpSecret;
    let otpauthUrl = '';

    if (!secretBase32) {
      // Generate a new key if not already generated
      const secret = speakeasy.generateSecret({
        name: `MGE Portal (${user.username})`,
        issuer: 'MGE Portal',
      });
      secretBase32 = secret.base32;
      otpauthUrl = secret.otpauth_url || '';

      // Save secret to database (keep isTotpEnabled: false until verified!)
      await prisma.user.update({
        where: { id: user.id },
        data: { totpSecret: secretBase32 },
      });
    } else {
      // Re-create otpauthUrl for existing secret if they refresh setup screen before verifying
      otpauthUrl = speakeasy.otpauthURL({
        secret: secretBase32,
        label: `MGE Portal (${user.username})`,
        issuer: 'MGE Portal',
        encoding: 'base32',
      });
    }

    // Generate QR code data URL
    const qrCodeUrl = await qrcode.toDataURL(otpauthUrl);

    return NextResponse.json({
      qrCodeUrl,
      secret: secretBase32,
    });
  } catch (error) {
    console.error('[MFA_SETUP] Setup failed:', error);
    return NextResponse.json({ error: 'MFA setup failed. Please try again.' }, { status: 500 });
  }
}
