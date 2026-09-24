import { NextRequest, NextResponse } from 'next/server';
import { r2Client, R2_BUCKET_NAME } from '@/lib/r2';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Verify Authorization (Director Only) ───────────────────────────────
    const userRole = request.headers.get('x-user-role');
    if (userRole !== 'DIRECTOR') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    // ── Fetch R2 Objects under prefix "backups/" ───────────────────────────
    let backups: { key: string; name: string; size: number; lastModified: string }[] = [];

    if (R2_BUCKET_NAME) {
      try {
        const response = await r2Client.send(
          new ListObjectsV2Command({
            Bucket: R2_BUCKET_NAME,
            Prefix: 'backups/',
          })
        );

        if (response.Contents) {
          backups = response.Contents
            .filter((item) => item.Key && item.Key !== 'backups/')
            .map((item) => {
              const parts = item.Key!.split('/');
              const name = parts[parts.length - 1];
              return {
                key: item.Key!,
                name,
                size: item.Size || 0,
                lastModified: item.LastModified?.toISOString() || new Date().toISOString(),
              };
            });

          // Sort descending by date
          backups.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
        }
      } catch (r2Err) {
        console.error('[DBMS_BACKUPS_GET] Cloudflare R2 listing failed:', r2Err);
      }
    }

    // ── Fetch Database Counts for overview ──────────────────────────────────
    const [students, staff, transactions, feePayments] = await Promise.all([
      prisma.student.count(),
      prisma.staff.count(),
      prisma.transaction.count(),
      prisma.feePayment.count(),
    ]);

    return NextResponse.json({
      backups,
      stats: {
        students,
        staff,
        transactions,
        feePayments,
      },
    });
  } catch (error: any) {
    console.error('[DBMS_BACKUPS_GET] Failed to list backups:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list backups.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
