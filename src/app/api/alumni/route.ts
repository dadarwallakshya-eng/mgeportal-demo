import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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

    // Role Check: Only Director or Principal can access alumni data
    if (!['DIRECTOR', 'PRINCIPAL'].includes(userRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Only Director or Principal can view alumni data.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    // Fetch graduated or withdrawn students
    const students = await prisma.student.findMany({
      where: {
        status: { in: ['GRADUATED', 'WITHDRAWN'] },
        unitId: { in: accessUnits },
      },
      include: {
        feeAllocations: {
          include: {
            feeComponent: true,
          },
        },
        concessions: true,
        unit: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Map and compute financials for each student
    const allStudentsMapped = students.map((student) => {
      const concessionsMap = new Map<string, { type: string; value: number }>();
      for (const c of student.concessions) {
        concessionsMap.set(c.feeComponentName, { type: c.discountType, value: Number(c.value) });
      }

      let totalOrig = 0;
      let totalPaid = 0;
      let totalNet = 0;
      let balanceDue = 0;

      for (const alloc of student.feeAllocations) {
        const orig = Number(alloc.amountDue);
        const paid = Number(alloc.amountPaid);
        const conc = concessionsMap.get(alloc.feeComponent.name);
        let net = orig;
        if (conc) {
          if (conc.type === 'FIXED_AMOUNT') {
            net = Math.max(0, orig - conc.value);
          } else {
            net = orig * (1 - conc.value / 100);
          }
        }
        const bal = Math.max(0, net - paid);

        totalOrig += orig;
        totalPaid += paid;
        totalNet += net;
        balanceDue += bal;
      }

      return {
        id: student.id,
        name: student.name,
        nameHindi: student.nameHindi,
        admissionNo: student.admissionNo,
        className: student.className,
        unitId: student.unitId,
        unitName: student.unit.name,
        phone: student.phone,
        fatherPhone: student.fatherPhone,
        status: student.status,
        totalOrig,
        totalPaid,
        balanceDue,
      };
    });

    const alumniList = allStudentsMapped.filter((s) => s.status === 'GRADUATED');
    const earlyLeaversList = allStudentsMapped.filter((s) => s.status === 'WITHDRAWN');

    // Compute aggregated metrics for alumni (graduated)
    const totalAlumni = alumniList.length;
    let duesClearedCount = 0;
    let withDuesCount = 0;
    let totalOutstanding = 0;
    let totalPaidSum = 0;
    
    const divisionBreakdown: Record<string, number> = {
      english: 0,
      hindi: 0,
      college: 0,
    };

    for (const alum of alumniList) {
      totalPaidSum += alum.totalPaid;
      if (alum.balanceDue > 0.005) {
        withDuesCount++;
        totalOutstanding += alum.balanceDue;
        if (alum.unitId in divisionBreakdown) {
          divisionBreakdown[alum.unitId] += alum.balanceDue;
        } else {
          divisionBreakdown[alum.unitId] = alum.balanceDue;
        }
      } else {
        duesClearedCount++;
      }
    }

    // Compute aggregated metrics for early leavers (withdrawn)
    const totalEarlyLeavers = earlyLeaversList.length;
    let elDuesClearedCount = 0;
    let elWithDuesCount = 0;
    let elTotalOutstanding = 0;
    let elTotalPaidSum = 0;
    
    const elDivisionBreakdown: Record<string, number> = {
      english: 0,
      hindi: 0,
      college: 0,
    };

    for (const el of earlyLeaversList) {
      elTotalPaidSum += el.totalPaid;
      if (el.balanceDue > 0.005) {
        elWithDuesCount++;
        elTotalOutstanding += el.balanceDue;
        if (el.unitId in elDivisionBreakdown) {
          elDivisionBreakdown[el.unitId] += el.balanceDue;
        } else {
          elDivisionBreakdown[el.unitId] = el.balanceDue;
        }
      } else {
        elDuesClearedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      alumni: alumniList,
      earlyLeavers: earlyLeaversList,
      metrics: {
        totalAlumni,
        duesClearedCount,
        withDuesCount,
        totalOutstanding,
        totalPaid: totalPaidSum,
        divisionBreakdown,
      },
      earlyLeaversMetrics: {
        totalEarlyLeavers,
        duesClearedCount: elDuesClearedCount,
        withDuesCount: elWithDuesCount,
        totalOutstanding: elTotalOutstanding,
        totalPaid: elTotalPaidSum,
        divisionBreakdown: elDivisionBreakdown,
      },
    });
  } catch (error) {
    console.error('[ALUMNI_API] Internal error:', error);
    return NextResponse.json(
      { error: 'An error occurred while fetching alumni data.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
