import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hostelGuard } from '@/lib/hostelAuth';
import { logAuditEvent } from '@/lib/audit';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = hostelGuard(request);
    if (!auth) {
      return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });
    }

    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'hostel_ledger_notes' }
    });

    return NextResponse.json({ notes: setting?.value || '' });
  } catch (error) {
    console.error('[HOSTEL_NOTES_GET]', error);
    return NextResponse.json({ error: 'Failed to retrieve notes.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = hostelGuard(request);
    if (!auth) {
      return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await request.json();
    const notes = String(body.notes || '').trim();

    const setting = await prisma.systemSetting.upsert({
      where: { key: 'hostel_ledger_notes' },
      update: { value: notes },
      create: { key: 'hostel_ledger_notes', value: notes }
    });

    await logAuditEvent(auth.userId, 'HOSTEL_NOTES_UPDATE', 'Hostel', 'hostel_ledger_notes', { length: notes.length });

    return NextResponse.json({ notes: setting.value });
  } catch (error) {
    console.error('[HOSTEL_NOTES_POST]', error);
    return NextResponse.json({ error: 'Failed to save notes.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
