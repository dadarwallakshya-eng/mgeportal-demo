import { NextRequest, NextResponse } from 'next/server';
import speakeasy from 'speakeasy';
import prisma from '@/lib/prisma';
import { verifyMfaPendingToken, createToken, computeFingerprint } from '@/lib/auth';
import { setSession } from '@/lib/session';
import { logAuditEvent } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      return NextResponse.json({ error: 'MFA pending token is required' }, { status: 401 });
    }

    const payload = await verifyMfaPendingToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'MFA session is invalid or expired' }, { status: 401 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { code } = body;
    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'A 6-digit code is required' }, { status: 400 });
    }

    // Retrieve user and their TOTP secret
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        username: true,
        role: true,
        name: true,
        accessUnits: true,
        totpSecret: true,
        isTotpEnabled: true,
      },
    });

    if (!user || !user.totpSecret) {
      return NextResponse.json({ error: 'MFA setup is not initialized' }, { status: 400 });
    }

    // Verify TOTP code (allow window: 1 for network/clock skew)
    const verified = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!verified) {
      // Log failed MFA attempt
      await logAuditEvent('ANONYMOUS', 'MFA_FAILED', 'Auth', user.id, {
        username: user.username,
        reason: 'Invalid 6-digit code',
      });
      return NextResponse.json({ error: 'Invalid 6-digit verification code' }, { status: 401 });
    }

    // Activate MFA if this was the first setup
    if (!user.isTotpEnabled) {
      await prisma.user.update({
        where: { id: user.id },
        data: { isTotpEnabled: true },
      });
      console.log(`[MFA_VERIFY] MFA enabled for user: ${user.username}`);
    }

    // Get client IP for audit log
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const userAgent = request.headers.get('user-agent');

    // Compute device fingerprint
    const fingerprint = computeFingerprint(userAgent, ip);

    // Generate final session token
    const sessionToken = await createToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      accessUnits: user.accessUnits as string[],
      name: user.name,
      fingerprint,
    });

    // Log successful login
    await logAuditEvent(user.id, 'LOGIN', 'Auth', user.id, {
      ip,
      mfaVerified: true,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        accessUnits: user.accessUnits,
      },
    });

    // Write session cookie
    setSession(response, sessionToken);

    return response;
  } catch (error) {
    console.error('[MFA_VERIFY] Verification failed:', error);
    return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 500 });
  }
}
