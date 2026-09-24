import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

const updateUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(150),
  username: z.string().email('Username must be a valid email').refine(
    (val) => val.endsWith('@mgportal.com') || val.endsWith('@mgeportal.com'),
    { message: 'Username must end with @mgportal.com or @mgeportal.com' }
  ),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100).optional().or(z.literal('')),
  email: z.string().email('Invalid email address').optional().nullable(),
  role: z.nativeEnum(Role),
  accessUnits: z.array(z.string()).min(1, 'Select at least one division/unit'),
  isActive: z.boolean().default(true),
});

function authorizeDirector(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const userRole = request.headers.get('x-user-role');
  if (!userId || userRole !== 'DIRECTOR') {
    return false;
  }
  return userId;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const directorId = authorizeDirector(request);
    if (!directorId) {
      return NextResponse.json({ error: 'Forbidden: Director access required', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, { status: 400 });
    }

    const validation = updateUserSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }

    const { name, username, password, email, role, accessUnits, isActive } = validation.data;

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: 'User not found', code: 'NOT_FOUND' }, { status: 444 });
    }

    // Check duplicate username if changed
    if (username !== user.username) {
      const duplicate = await prisma.user.findUnique({ where: { username } });
      if (duplicate) {
        return NextResponse.json({
          error: 'Username is already registered',
          code: 'VALIDATION_ERROR',
          details: [{ field: 'username', message: 'Username is already taken' }],
        }, { status: 400 });
      }
    }

    const updateData: any = {
      name,
      username,
      email: email ? email.toLowerCase().trim() : null,
      role,
      accessUnits,
      isActive,
    };

    if (password && password.trim() !== '') {
      updateData.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    await logAuditEvent(directorId, 'UPDATE', 'User', id, {
      name: updatedUser.name,
      username: updatedUser.username,
      role: updatedUser.role,
    });

    return NextResponse.json({
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        accessUnits: updatedUser.accessUnits,
        isActive: updatedUser.isActive,
        createdAt: updatedUser.createdAt,
      }
    });
  } catch (error) {
    console.error('[USERS_PATCH]', error);
    return NextResponse.json({ error: 'Failed to update user', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const directorId = authorizeDirector(request);
    if (!directorId) {
      return NextResponse.json({ error: 'Forbidden: Director access required', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: 'User not found', code: 'NOT_FOUND' }, { status: 444 });
    }

    if (user.role === Role.DIRECTOR) {
      return NextResponse.json({ error: 'Cannot deactivate director accounts', code: 'FORBIDDEN' }, { status: 403 });
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    await logAuditEvent(directorId, 'DELETE', 'User', id, {
      name: user.name,
      username: user.username,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[USERS_DELETE]', error);
    return NextResponse.json({ error: 'Failed to deactivate user', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
