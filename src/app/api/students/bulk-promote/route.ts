import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { applyStudentTransport } from '@/lib/transport';
import { getNextClass } from '@/lib/classes';
import { FeeStatus, StudentStatus } from '@prisma/client';
import { terminateHostelResidency } from '@/lib/hostel';

export async function POST(request: NextRequest): Promise<NextResponse> {
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

    // 1. Role Check: Only Director or Principal can promote
    if (!['DIRECTOR', 'PRINCIPAL'].includes(userRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Only Director or Principal can promote classes.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    // 2. Parse request body
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const { division, sourceClasses, class10Promotions, academicYear, password } = body;

    if (!division || !accessUnits.includes(division)) {
      return NextResponse.json(
        { error: 'A valid division is required.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const hasSourceClasses = sourceClasses && Array.isArray(sourceClasses) && sourceClasses.length > 0;
    const hasClass10Promotions = class10Promotions && Array.isArray(class10Promotions) && class10Promotions.length > 0;

    if (!hasSourceClasses && !hasClass10Promotions) {
      return NextResponse.json(
        { error: 'Select at least one class or student to promote.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!academicYear || !/^\d{4}-\d{2}$/.test(academicYear)) {
      return NextResponse.json(
        { error: 'A valid target academic year is required (e.g. 2026-27).', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!password) {
      return NextResponse.json(
        { error: 'Confirmation password is required.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // 3. Password Verification
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User account not found.', code: 'USER_NOT_FOUND' },
        { status: 404 }
      );
    }

    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Incorrect confirmation password.', code: 'INVALID_PASSWORD' },
        { status: 400 }
      );
    }

    // 4. Resolve next classes and check fee structures beforehand
    const nextClassMappings: Record<string, string | 'GRADUATED'> = {};
    const requiredStructures: string[] = [];

    if (hasSourceClasses) {
      for (const sourceClass of sourceClasses) {
        const target = getNextClass(sourceClass);
        if (!target) {
          // Class 10 (needs stream choice) or unrecognized class
          continue;
        }
        nextClassMappings[sourceClass] = target;
        if (target !== 'GRADUATED') {
          requiredStructures.push(target);
        }
      }
    }

    if (hasClass10Promotions) {
      for (const p of class10Promotions) {
        if (p.targetClass && p.targetClass !== 'GRADUATED') {
          if (!requiredStructures.includes(p.targetClass)) {
            requiredStructures.push(p.targetClass);
          }
        }
      }
    }

    // If no promotable classes or students mapped
    if (Object.keys(nextClassMappings).length === 0 && !hasClass10Promotions) {
      return NextResponse.json(
        { error: 'None of the selected classes or students can be promoted.', code: 'NO_VALID_CLASSES' },
        { status: 400 }
      );
    }

    // Verify all required fee structures exist
    const missingStructures: string[] = [];
    const feeStructuresMap: Record<string, any> = {};

    for (const targetClass of requiredStructures) {
      const structure = await prisma.feeStructure.findFirst({
        where: {
          unitId: division,
          className: targetClass,
          academicYear,
        },
        include: {
          components: true,
        },
      });

      if (!structure) {
        missingStructures.push(targetClass);
      } else {
        feeStructuresMap[targetClass] = structure;
      }
    }

    if (missingStructures.length > 0) {
      return NextResponse.json(
        {
          error: `Fee structures are not configured for target classes: ${missingStructures.join(', ')} in session ${academicYear}. Please configure them first.`,
          code: 'MISSING_FEE_STRUCTURES',
        },
        { status: 400 }
      );
    }

    // 5. Execute promotion loops sequentially (for PgBouncer compatibility)
    const startYear = parseInt(academicYear.split('-')[0]);
    const refDate = new Date(startYear, 5, 1); // June 1st of target academic year

    let promotedCount = 0;
    let graduatedCount = 0;

    // Helper functions for student promotion/graduation
    const promoteStudent = async (student: any, target: string) => {
      await prisma.student.update({
        where: { id: student.id },
        data: { className: target },
      });

      // Allocate new class fees
      const feeStructure = feeStructuresMap[target];
      if (feeStructure) {
        for (const comp of feeStructure.components) {
          if (comp.name === 'Previous Outstanding Fees' || comp.name === 'Transport Fee') {
            continue;
          }

          const amount = Number(comp.amount);
          if (amount <= 0) continue;

          const existingAlloc = await prisma.feeAllocation.findFirst({
            where: {
              studentId: student.id,
              feeComponentId: comp.id,
            },
          });

          if (!existingAlloc) {
            await prisma.feeAllocation.create({
              data: {
                studentId: student.id,
                feeComponentId: comp.id,
                amountDue: amount,
                amountPaid: 0,
                dueDate: refDate,
                status: FeeStatus.UNPAID,
              },
            });
          }
        }
      }

      // Allocate transport fee
      if (student.transportMode === 'BUS_SERVICE' && student.busStationId) {
        try {
          await applyStudentTransport({
            studentId: student.id,
            unitId: student.unitId,
            className: target,
            admissionDate: refDate,
            transportMode: student.transportMode,
            busStationId: student.busStationId,
          });
        } catch (transportErr) {
          console.error(`[BULK_PROMOTE] Transport allocation failed for student ${student.id}:`, transportErr);
        }
      }
    };

    const graduateStudent = async (studentId: string) => {
      await prisma.student.update({
        where: { id: studentId },
        data: { status: StudentStatus.GRADUATED },
      });
      // Terminate hostel residency
      try {
        await terminateHostelResidency(studentId, refDate);
      } catch (hostelErr) {
        console.error(`[BULK_PROMOTE] Hostel termination failed for student ${studentId}:`, hostelErr);
      }
    };

    if (hasSourceClasses) {
      for (const sourceClass of Object.keys(nextClassMappings)) {
        const target = nextClassMappings[sourceClass];

        const students = await prisma.student.findMany({
          where: {
            unitId: division,
            className: sourceClass,
            status: StudentStatus.ACTIVE,
          },
        });

        for (const student of students) {
          if (target === 'GRADUATED') {
            await graduateStudent(student.id);
            graduatedCount++;
          } else {
            await promoteStudent(student, target);
            promotedCount++;
          }
        }
      }
    }

    if (hasClass10Promotions) {
      for (const p of class10Promotions) {
        const student = await prisma.student.findFirst({
          where: {
            id: p.studentId,
            unitId: division,
            className: '10',
            status: StudentStatus.ACTIVE,
          },
        });

        if (student) {
          if (p.targetClass === 'GRADUATED') {
            await graduateStudent(student.id);
            graduatedCount++;
          } else {
            await promoteStudent(student, p.targetClass);
            promotedCount++;
          }
        }
      }
    }

    // 6. Audit Log
    await logAuditEvent(userId, 'UPDATE', 'Student', `BULK_PROMOTE:${division}`, {
      action: 'BULK_CLASS_PROMOTION',
      division,
      classesPromoted: Object.keys(nextClassMappings),
      hasClass10Promotions,
      promotedCount,
      graduatedCount,
      academicYear,
    });

    return NextResponse.json({
      success: true,
      message: `Successfully promoted ${promotedCount} students and graduated ${graduatedCount} students across the selected groups for Session ${academicYear}.`,
    });
  } catch (error) {
    console.error('[STUDENT_BULK_PROMOTE] Internal error:', error);
    return NextResponse.json(
      { error: 'An error occurred while promoting classes.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
