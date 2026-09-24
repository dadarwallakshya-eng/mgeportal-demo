import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(150),
  username: z.string().email('Username must be a valid email').refine(
    (val) => val.endsWith('@mgportal.com') || val.endsWith('@mgeportal.com'),
    { message: 'Username must end with @mgportal.com or @mgeportal.com' }
  ),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const directorId = authorizeDirector(request);
    if (!directorId) {
      return NextResponse.json({ error: 'Forbidden: Director access required', code: 'FORBIDDEN' }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      orderBy: [
        { role: 'asc' },
        { name: 'asc' },
      ],
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        accessUnits: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('[USERS_GET]', error);
    return NextResponse.json({ error: 'Failed to retrieve users', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const directorId = authorizeDirector(request);
    if (!directorId) {
      return NextResponse.json({ error: 'Forbidden: Director access required', code: 'FORBIDDEN' }, { status: 403 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, { status: 400 });
    }

    const validation = createUserSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }

    const { name, username, password, email, role, accessUnits, isActive } = validation.data;

    // Check duplicate username
    const duplicate = await prisma.user.findUnique({ where: { username } });
    if (duplicate) {
      return NextResponse.json({
        error: 'Username is already registered',
        code: 'VALIDATION_ERROR',
        details: [{ field: 'username', message: 'Username is already taken' }],
      }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const newUser = await prisma.user.create({
      data: {
        name,
        username,
        email: email ? email.toLowerCase().trim() : null,
        role,
        accessUnits,
        isActive,
        passwordHash,
      },
    });

    await logAuditEvent(directorId, 'CREATE', 'User', newUser.id, {
      name: newUser.name,
      username: newUser.username,
      role: newUser.role,
    });

    return NextResponse.json({
      user: {
        id: newUser.id,
        name: newUser.name,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        accessUnits: newUser.accessUnits,
        isActive: newUser.isActive,
        createdAt: newUser.createdAt,
      }
    }, { status: 201 });
  } catch (error) {
    console.error('[USERS_POST]', error);
    return NextResponse.json({ error: 'Failed to create user', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
