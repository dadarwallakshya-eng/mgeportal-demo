import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function checkAuth(request: NextRequest) {
  const role = request.headers.get('x-user-role');
  const userId = request.headers.get('x-user-id');
  if (!userId || role !== 'DIRECTOR') {
    return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  try {
    if (!checkAuth(request)) {
      return NextResponse.json({ error: 'Access denied. Director role required.', code: 'FORBIDDEN' }, { status: 403 });
    }

    const phoneSetting = await prisma.systemSetting.findUnique({ where: { key: 'callmebot_phone' } });
    const apikeySetting = await prisma.systemSetting.findUnique({ where: { key: 'callmebot_apikey' } });

    return NextResponse.json({
      phone: phoneSetting?.value || '',
      apikey: apikeySetting?.value || ''
    });
  } catch (error: any) {
    console.error('[ALERT_CONFIG_GET]', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch config', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!checkAuth(request)) {
      return NextResponse.json({ error: 'Access denied. Director role required.', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { phone, apikey } = await request.json();

    await prisma.$transaction([
      prisma.systemSetting.upsert({
        where: { key: 'callmebot_phone' },
        update: { value: phone || '' },
        create: { key: 'callmebot_phone', value: phone || '' }
      }),
      prisma.systemSetting.upsert({
        where: { key: 'callmebot_apikey' },
        update: { value: apikey || '' },
        create: { key: 'callmebot_apikey', value: apikey || '' }
      })
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[ALERT_CONFIG_POST]', error);
    return NextResponse.json({ error: error.message || 'Failed to save config', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
