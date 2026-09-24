import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAuditEvent } from '@/lib/audit';

// GET: List all whitelisted emails
export async function GET(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role');
    if (role !== 'DIRECTOR') {
      return NextResponse.json({ error: 'Access denied. Director role required.' }, { status: 403 });
    }

    const whitelist = await prisma.googleWhitelist.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ whitelist });
  } catch (error) {
    console.error('[WHITELIST_GET] Failed to load whitelist:', error);
    return NextResponse.json({ error: 'Failed to retrieve whitelist' }, { status: 500 });
  }
}

// POST: Add a new email to the whitelist
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role');
    const operatorId = request.headers.get('x-user-id') || 'unknown';

    if (role !== 'DIRECTOR') {
      return NextResponse.json({ error: 'Access denied. Director role required.' }, { status: 403 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const { email, name } = body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
    }

    const sanitizedEmail = email.trim().toLowerCase();

    // Check if already exists
    const existing = await prisma.googleWhitelist.findUnique({
      where: { email: sanitizedEmail },
    });

    if (existing) {
      return NextResponse.json({ error: 'Email is already whitelisted' }, { status: 400 });
    }

    const entry = await prisma.googleWhitelist.create({
      data: {
        email: sanitizedEmail,
        name: name ? name.trim() : null,
      },
    });

    // Log security audit log
    await logAuditEvent(operatorId, 'WHITELIST_ADD', 'Auth', entry.id, {
      addedEmail: sanitizedEmail,
      addedName: name,
    });

    return NextResponse.json({ success: true, entry });
  } catch (error) {
    console.error('[WHITELIST_POST] Failed to add email:', error);
    return NextResponse.json({ error: 'Failed to add email to whitelist' }, { status: 500 });
  }
}

// DELETE: Remove an email from the whitelist by ID
export async function DELETE(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role');
    const operatorId = request.headers.get('x-user-id') || 'unknown';

    if (role !== 'DIRECTOR') {
      return NextResponse.json({ error: 'Access denied. Director role required.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Whitelist entry ID is required' }, { status: 400 });
    }

    const existing = await prisma.googleWhitelist.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Whitelist entry not found' }, { status: 404 });
    }

    // Do not allow deleting dadarwallakshya@gmail.com to prevent lockouts!
    if (existing.email === 'dadarwallakshya@gmail.com') {
      return NextResponse.json({ error: 'The primary owner email cannot be removed from the whitelist.' }, { status: 400 });
    }

    await prisma.googleWhitelist.delete({
      where: { id },
    });

    // Log security audit log
    await logAuditEvent(operatorId, 'WHITELIST_REMOVE', 'Auth', id, {
      removedEmail: existing.email,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[WHITELIST_DELETE] Failed to delete email:', error);
    return NextResponse.json({ error: 'Failed to delete email from whitelist' }, { status: 500 });
  }
}
