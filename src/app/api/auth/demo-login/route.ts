/**
 * @module api/auth/demo-login
 * @description Quick evaluator login API for Razorpay AI Builder demo submission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createToken } from '@/lib/auth';
import { setSession } from '@/lib/session';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const targetRole = body.role || 'DIRECTOR';

    const usernameMap: Record<string, { username: string; name: string; role: Role; accessUnits: string[] }> = {
      DIRECTOR: {
        username: 'director_demo',
        name: 'Director Demo',
        role: Role.DIRECTOR,
        accessUnits: ['hindi', 'english', 'college', 'hostel', 'transport'],
      },
      PRINCIPAL: {
        username: 'principal_demo',
        name: 'Principal Demo',
        role: Role.PRINCIPAL,
        accessUnits: ['hindi', 'english'],
      },
      DEPARTMENT_HEAD: {
        username: 'hostel_head_demo',
        name: 'Hostel Head Demo',
        role: Role.DEPARTMENT_HEAD,
        accessUnits: ['hostel'],
      },
    };

    const config = usernameMap[targetRole] || usernameMap.DIRECTOR;

    let userId = crypto.randomUUID();
    let userRole = config.role;
    let userName = config.name;
    let username = config.username;
    let accessUnits = config.accessUnits;

    try {
      let user = await prisma.user.findFirst({
        where: { username: config.username },
      });

      if (!user) {
        user = await prisma.user.findFirst({
          where: { role: config.role },
        });
      }

      if (!user) {
        const defaultPasswordHash = await bcrypt.hash('DemoPass123!', 10);
        user = await prisma.user.create({
          data: {
            username: config.username,
            name: config.name,
            role: config.role,
            passwordHash: defaultPasswordHash,
            accessUnits: config.accessUnits,
          },
        });
      }

      if (user) {
        userId = user.id;
        userRole = user.role;
        userName = user.name;
        username = user.username;
        accessUnits = user.accessUnits || config.accessUnits;
      }
    } catch (dbErr) {
      console.warn('[DEMO_LOGIN_DB_WARN] Proceeding with resilient demo session:', dbErr);
    }

    // Create JWT Session Token
    const token = await createToken({
      jti: crypto.randomUUID(),
      userId,
      username,
      role: userRole,
      accessUnits,
      name: userName,
    });

    const response = NextResponse.json({
      success: true,
      message: `Authenticated as ${userName}`,
      user: {
        id: userId,
        name: userName,
        role: userRole,
        username,
        accessUnits,
      },
    });

    setSession(response, token);
    return response;
  } catch (error: any) {
    console.error('Error during demo login:', error);
    return NextResponse.json(
      { error: 'Failed to process demo login', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
