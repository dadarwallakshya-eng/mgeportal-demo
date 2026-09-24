import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const operatorId = request.headers.get('x-user-id');
    const operatorRole = request.headers.get('x-user-role');

    if (!operatorId || operatorRole !== 'DIRECTOR') {
      return NextResponse.json(
        { error: 'Only Directors can perform administrative 2FA resets', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { targetUserId } = body;

    if (!targetUserId) {
      return NextResponse.json({ error: 'Target user ID is required' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, username: true, name: true }
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    // Reset TOTP status for the user
    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        totpSecret: null,
        isTotpEnabled: false,
      },
    });

    await logAuditEvent(operatorId, 'MFA_RESET', 'Auth', targetUserId, {
      reason: `2FA reset initiated by Director (${operatorId}) for user ${targetUser.username}`,
      targetUsername: targetUser.username,
    });

    console.log(`[MFA_ADMIN_RESET] 2FA reset by Director for user: ${targetUser.username} (${targetUserId})`);

    return NextResponse.json({
      success: true,
      message: `2FA has been successfully reset for ${targetUser.name} (${targetUser.username}).`,
    });
  } catch (error) {
    console.error('[MFA_ADMIN_RESET] Failed to reset 2FA:', error);
    return NextResponse.json({ error: 'Failed to perform administrative 2FA reset' }, { status: 500 });
  }
}
