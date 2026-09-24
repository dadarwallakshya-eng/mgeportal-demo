import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const isDbConnected = await prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch((err) => {
        return { error: err.message || err };
      });

    return NextResponse.json({
      status: 'healthy',
      database: isDbConnected === true ? 'CONNECTED' : 'FAILED',
      databaseError: isDbConnected === true ? null : isDbConnected,
      env: {
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasDirectDatabaseUrl: !!process.env.DIRECT_DATABASE_URL,
        hasJwtSecret: !!process.env.JWT_SECRET,
        databaseUrlLength: process.env.DATABASE_URL?.length || 0,
      }
    });
  } catch (err: any) {
    return NextResponse.json({
      status: 'unhealthy',
      error: err.message || err
    }, { status: 500 });
  }
}
