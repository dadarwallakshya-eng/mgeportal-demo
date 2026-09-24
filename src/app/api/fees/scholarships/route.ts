import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role') || '';
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    // Only allow Director to access the concessions list
    if (userRole !== 'DIRECTOR') {
      return NextResponse.json({ error: 'Access denied. Director only.', code: 'FORBIDDEN' }, { status: 403 });
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    // Fetch concessions and join student, division, and allocations
    const concessions = await prisma.studentConcession.findMany({
      where: {
        student: {
          unitId: { in: accessUnits },
        },
      },
      include: {
        student: {
          include: {
            unit: { select: { name: true } },
            feeAllocations: {
              include: {
                feeComponent: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Extract unique user IDs who awarded these concessions
    const setByIds = Array.from(new Set(concessions.map((c) => c.setBy).filter(Boolean))) as string[];

    // Fetch display names for all user IDs
    const users = await prisma.user.findMany({
      where: { id: { in: setByIds } },
      select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    // Format the response rows
    const formatted = concessions.map((c) => {
      const matchingAlloc = c.student.feeAllocations.find(
        (a) => a.feeComponent.name === c.feeComponentName
      );
      const originalFee = matchingAlloc ? Number(matchingAlloc.amountDue) : 0;
      const discountPercent = Number(c.value);
      const discountValue = originalFee * (discountPercent / 100);

      return {
        id: c.id,
        studentId: c.studentId,
        studentName: c.student.name,
        admissionNo: c.student.admissionNo,
        className: c.student.className,
        section: c.student.section,
        division: c.student.unit.name,
        feeComponentName: c.feeComponentName,
        originalFee,
        discountPercent,
        discountValue,
        awardedByName: userMap.get(c.setBy || '') || 'System / Unknown',
        awardedByRole: c.setByRole || 'System',
        reason: c.reason || '',
        createdAt: c.createdAt,
      };
    });

    return NextResponse.json({ ok: true, concessions: formatted });
  } catch (error) {
    console.error('[SCHOLARSHIPS_GET] Internal error:', error);
    return NextResponse.json(
      { error: 'An error occurred while fetching concessions.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
