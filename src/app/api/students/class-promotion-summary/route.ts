import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getClassesForUnit } from '@/lib/classes';
import { StudentStatus } from '@prisma/client';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const accessUnitsRaw = request.headers.get('x-user-access-units');
    const userRole = request.headers.get('x-user-role');

    if (!userId || !accessUnitsRaw || !userRole) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);
    const { searchParams } = new URL(request.url);
    const unitParam = searchParams.get('unit');

    if (!unitParam) {
      return NextResponse.json(
        { error: 'Unit parameter is required', code: 'MISSING_PARAM' },
        { status: 400 }
      );
    }

    if (!accessUnits.includes(unitParam)) {
      return NextResponse.json(
        { error: 'Access denied for this division', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // Load count of active students grouped by class
    const studentGroupCounts = await prisma.student.groupBy({
      by: ['className'],
      where: {
        unitId: unitParam,
        status: StudentStatus.ACTIVE,
      },
      _count: {
        id: true,
      },
    });

    const countsMap = new Map<string, number>();
    for (const group of studentGroupCounts) {
      countsMap.set(group.className, group._count.id);
    }

    // Format output matching classesForUnit display order
    const classesForUnit = getClassesForUnit(unitParam);
    const summary = classesForUnit.map((c) => {
      const activeCount = countsMap.get(c.key) || 0;
      return {
        className: c.key,
        classLabel: c.label,
        activeCount,
      };
    });

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('[CLASS_PROMOTION_SUMMARY] Internal error:', error);
    return NextResponse.json(
      { error: 'Failed to load class promotion summary.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
