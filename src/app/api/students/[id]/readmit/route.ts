/**
 * @module api/students/[id]/readmit
 * @description API endpoint to re-admit / reactivate a withdrawn or graduated student.
 *
 * POST — Changes student status back to 'ACTIVE' and logs a READMIT audit event.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAuditEvent } from '@/lib/audit';
import { StudentStatus } from '@prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Invalid student ID format', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    const userId = request.headers.get('x-user-id');
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    const student = await prisma.student.findUnique({
      where: { id },
      select: { id: true, name: true, admissionNo: true, unitId: true, status: true },
    });

    if (!student) {
      return NextResponse.json(
        { error: 'Student record not found', code: 'RECORD_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (!accessUnits.includes(student.unitId)) {
      return NextResponse.json(
        { error: 'Access denied for this unit', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    if (student.status === StudentStatus.ACTIVE) {
      return NextResponse.json(
        { error: 'Student is already active', code: 'ALREADY_ACTIVE' },
        { status: 400 }
      );
    }

    const previousStatus = student.status;

    const readmittedStudent = await prisma.student.update({
      where: { id },
      data: {
        status: StudentStatus.ACTIVE,
      },
    });

    await logAuditEvent(userId, 'READMIT' as any, 'Student', id, {
      name: student.name,
      admissionNo: student.admissionNo,
      previousStatus,
    });

    return NextResponse.json({
      message: `Student '${student.name}' has been successfully re-admitted to ACTIVE status.`,
      student: readmittedStudent,
    });
  } catch (error) {
    console.error('[STUDENT_READMIT_POST]', error);
    return NextResponse.json(
      { error: 'Failed to re-admit student', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
