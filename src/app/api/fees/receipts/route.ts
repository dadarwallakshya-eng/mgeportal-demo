/**
 * @module api/fees/receipts
 * @description Paginated receipt log — all FeePayments with student + component breakdowns.
 *
 * GET — Returns paginated fee payment receipts filtered by unit / date range.
 *
 * SECURITY:
 * - RBAC: results are restricted to the user's accessible units via student.unitId.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);
    const { searchParams } = new URL(request.url);

    const unitParam = searchParams.get('unit') || 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(50, parseInt(searchParams.get('limit') || '20')));
    const skip = (page - 1) * limit;
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const searchQuery = searchParams.get('search')?.trim() || '';

    let targetUnits = accessUnits;
    if (unitParam !== 'all') {
      if (!accessUnits.includes(unitParam)) {
        return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
      }
      targetUnits = [unitParam];
    }

    const dateFilter: Record<string, Date> = {};
    if (fromDate) dateFilter.gte = new Date(fromDate);
    if (toDate) {
      const toD = new Date(toDate);
      toD.setHours(23, 59, 59, 999);
      dateFilter.lte = toD;
    }

    const baseWhere = {
      student: {
        unitId: { in: targetUnits },
        ...(searchQuery
          ? {
              OR: [
                { name: { contains: searchQuery, mode: 'insensitive' as const } },
                { admissionNo: { contains: searchQuery, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      ...(Object.keys(dateFilter).length ? { paymentDate: dateFilter } : {}),
    };

    // Promise.all instead of $transaction — PgBouncer transaction mode forbids interactive transactions
    const [payments, total] = await Promise.all([
      prisma.feePayment.findMany({
        where: baseWhere,
        include: {
          student: {
            select: {
              name: true,
              admissionNo: true,
              className: true,
              section: true,
              unitId: true,
              unit: { select: { name: true } },
            },
          },
          details: {
            include: {
              feeAllocation: {
                include: { feeComponent: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: { paymentDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.feePayment.count({ where: baseWhere }),
    ]);

    return NextResponse.json({
      payments,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[FEE_RECEIPTS_GET]', error);
    return NextResponse.json({ error: 'Failed to load receipts.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
