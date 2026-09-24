/**
 * @module api/auth/demo-login
 * @description Quick 1-click evaluator login API for Razorpay AI Builder demo submission.
 * Bypasses Google OAuth and email whitelisting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createToken } from '@/lib/auth';
import { setSession } from '@/lib/session';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const targetRole = body.role || 'DIRECTOR';

    const usernameMap: Record<string, { username: string; name: string; accessUnits: string[] }> = {
      DIRECTOR: { username: 'director_demo', name: 'Director Demo (Razorpay)', accessUnits: ['all'] },
      PRINCIPAL: { username: 'principal_demo', name: 'Principal Demo (Razorpay)', accessUnits: ['hindi', 'english'] },
      DEPARTMENT_HEAD: { username: 'hostel_head_demo', name: 'Hostel Head Demo (Razorpay)', accessUnits: ['hostel'] },
    };

    const config = usernameMap[targetRole] || usernameMap.DIRECTOR;

    // Find or create demo user
    let user = await prisma.user.findFirst({
      where: { username: config.username },
    });

    if (!user) {
      const defaultPasswordHash = await bcrypt.hash('DemoPass123!', 10);
      user = await prisma.user.create({
        data: {
          username: config.username,
          name: config.name,
          role: targetRole as any,
          passwordHash: defaultPasswordHash,
          accessUnits: config.accessUnits,
        },
      });
    }

    // Create JWT Session Token
    const token = await createToken({
      jti: crypto.randomUUID(),
      userId: user.id,
      username: user.username,
      role: user.role,
      accessUnits: user.accessUnits || ['all'],
      name: user.name,
    });

    // Set HttpOnly session cookie
    const response = NextResponse.json({
      success: true,
      message: `Authenticated as ${user.name}`,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        username: user.username,
        accessUnits: user.accessUnits,
      },
    });

    await setSession(response, token);
    return response;
  } catch (error: any) {
    console.error('Error during demo login:', error);
    return NextResponse.json(
      { error: 'Failed to process demo login', details: error.message },
      { status: 500 }
    );
  }
}
