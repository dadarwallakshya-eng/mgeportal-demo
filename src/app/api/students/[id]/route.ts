/**
 * @module api/students/[id]
 * @description API endpoint for CRUD operations on a single student record.
 *
 * SECURITY DECISIONS:
 * - GET: Retrieves student profile details, fees history, and concessions. Requires access validation.
 * - PATCH: Updates a student record. Implements partial validation. Enforces RBAC checks.
 * - DELETE: Performs a soft-delete (updates status to 'WITHDRAWN'). Hard-deletes are forbidden
 *   to preserve double-entry ledger historical records (payments, receipts, audit trails).
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { studentSchema } from '@/lib/validations';
import { logAuditEvent } from '@/lib/audit';
import { StudentStatus, Gender, Category } from '@prisma/client';
import { renameFileInR2, deleteFileFromR2 } from '@/lib/r2';
import { applyClassFees } from '@/lib/classFees';
import { applyStudentTransport } from '@/lib/transport';
import { terminateHostelResidency } from '@/lib/hostel';

// Helper to validate UUID format
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // Validate UUID format
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Invalid student ID format', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    // ── Verify authentication ─────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    // ── Query Student Details ─────────────────────────────────────────────
    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        unit: {
          select: { name: true },
        },
        busStation: {
          select: { id: true, stationNo: true, name: true, perMonth: true, perYear: true },
        },
        feeAllocations: {
          include: {
            feeComponent: {
              include: {
                feeStructure: true,
              },
            },
          },
          orderBy: { dueDate: 'asc' },
        },
        feePayments: {
          orderBy: { paymentDate: 'desc' },
        },
        concessions: true,
        hostelAllocations: {
          where: { status: 'ACTIVE' },
          include: {
            room: true,
          },
        },
        hostelResident: {
          include: {
            room: true,
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        { error: 'Student record not found', code: 'RECORD_NOT_FOUND' },
        { status: 404 }
      );
    }

    // RBAC: Check if user has access to this student's division unit
    const isHostelOnlyUser = accessUnits.includes('hostel') && !accessUnits.some(u => u === 'mes' || u === 'nms' || u === 'college' || u === 'all');
    if (isHostelOnlyUser) {
      if (!student.hostelResident) {
        return NextResponse.json(
          { error: 'Access denied: Hostel HOD can only access hostel resident student profiles.', code: 'FORBIDDEN' },
          { status: 403 }
        );
      }
    } else if (!accessUnits.includes(student.unitId)) {
      return NextResponse.json(
        { error: 'Access denied for this division', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    let hostelAccount = null;
    if (student.hostelResident) {
      const { getResidentAccount } = await import('@/lib/hostel');
      hostelAccount = await getResidentAccount(
        student.id,
        Number(student.hostelResident.annualFee),
        student.hostelResident.discountType,
        Number(student.hostelResident.discountValue),
        Number(student.hostelResident.previousOutstanding || 0)
      );
    }

    return NextResponse.json({ student: { ...student, hostelAccount } });
  } catch (error) {
    console.error('[STUDENT_DETAILS_GET] Internal error:', error);
    return NextResponse.json(
      { error: 'An error occurred while fetching student details.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // Validate UUID format
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Invalid student ID format', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    // ── Verify authentication ─────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    // ── Check if record exists and user has rights ───────────────────────
    const existingStudent = await prisma.student.findUnique({
      where: { id },
    });

    if (!existingStudent) {
      return NextResponse.json(
        { error: 'Student record not found', code: 'RECORD_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (!accessUnits.includes(existingStudent.unitId)) {
      return NextResponse.json(
        { error: 'Access denied for this division', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // ── Parse and validate request body ──────────────────────────────────
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    // To allow partial updates in PATCH, we merge input with existing student details,
    // and run validations on the merged object.
    const mergedData = {
      firstName: body.firstName || existingStudent.name.split(' ')[0] || '',
      lastName: body.lastName !== undefined ? body.lastName : (existingStudent.name.split(' ').slice(1).join(' ') || ''),
      dateOfBirth: body.dateOfBirth || existingStudent.dob.toISOString().split('T')[0],
      gender: body.gender || existingStudent.gender,
      bloodGroup: body.bloodGroup !== undefined ? body.bloodGroup : (existingStudent.bloodGroup || undefined),
      religion: body.religion !== undefined ? body.religion : (existingStudent.religion || undefined),
      nationality: body.nationality !== undefined ? body.nationality : (existingStudent.nationality || undefined),
      classId: body.classId || existingStudent.className,
      sectionId: body.sectionId || '-',
      admissionDate: body.admissionDate || existingStudent.admissionDate.toISOString().split('T')[0],
      academicYearId: body.academicYearId || '2025-26',
      srNo: body.srNo !== undefined ? (body.srNo || '') : (existingStudent.srNo || ''),
      fatherName: body.fatherName !== undefined ? body.fatherName : (existingStudent.fatherName || ''),
      motherName: body.motherName !== undefined ? body.motherName : (existingStudent.motherName || ''),
      phone: body.phone !== undefined ? (body.phone || '') : (existingStudent.phone || ''),
      guardianPhone: body.guardianPhone !== undefined ? (body.guardianPhone || '') : (existingStudent.fatherPhone || ''),
      address: body.address !== undefined ? (body.address || '') : (existingStudent.address || ''),
      aadharNo: body.aadharNo !== undefined ? (body.aadharNo || '') : (existingStudent.aadharNo || ''),
      photoUrl: body.photoUrl !== undefined ? body.photoUrl : (existingStudent.photoUrl || ''),
      aadharDocUrl: body.aadharDocUrl !== undefined ? body.aadharDocUrl : (existingStudent.aadharDocUrl || ''),
      parentAadharDocUrl: body.parentAadharDocUrl !== undefined ? body.parentAadharDocUrl : (existingStudent.parentAadharDocUrl || ''),
    };

    const validation = studentSchema.safeParse(mergedData);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validation.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const input = validation.data;

    // ── Handle File Updates & Renames (Google Drive or Cloudflare R2) ──────
    const handleFileUpdate = async (
      newVal: string | undefined | null,
      oldVal: string | null,
      suffix: string
    ): Promise<string | null | undefined> => {
      if (newVal === undefined) return undefined;
      
      if (newVal === null || newVal === '') {
        if (oldVal) {
          await deleteFileFromR2(oldVal);
        }
        return null;
      }

      if (newVal !== oldVal) {
        const finalKey = await renameFileInR2(newVal, suffix);

        if (oldVal && oldVal !== finalKey) {
          await deleteFileFromR2(oldVal);
        }
        return finalKey;
      }

      return newVal;
    };

    let resolvedPhotoUrl: string | null | undefined = undefined;
    let resolvedAadharDocUrl: string | null | undefined = undefined;
    let resolvedParentAadharDocUrl: string | null | undefined = undefined;

    try {
      resolvedPhotoUrl = await handleFileUpdate(
        body.photoUrl !== undefined ? input.photoUrl : undefined,
        existingStudent.photoUrl,
        existingStudent.admissionNo
      );
      resolvedAadharDocUrl = await handleFileUpdate(
        body.aadharDocUrl !== undefined ? input.aadharDocUrl : undefined,
        existingStudent.aadharDocUrl,
        `${existingStudent.admissionNo}_Aadhar`
      );
      resolvedParentAadharDocUrl = await handleFileUpdate(
        body.parentAadharDocUrl !== undefined ? input.parentAadharDocUrl : undefined,
        existingStudent.parentAadharDocUrl,
        `${existingStudent.admissionNo}_Parent_Aadhar`
      );
    } catch (fileErr) {
      console.error('[STUDENT_PATCH] File sync failed:', fileErr);
    }

    // ── Update Student Record ─────────────────────────────────────────────
    const updatedStudent = await prisma.student.update({
      where: { id },
      data: {
        // admissionNo is permanent — intentionally NOT in this update payload.
        className: input.classId,
        section: input.sectionId,
        srNo: input.srNo || null,
        name: `${input.firstName} ${input.lastName}`.trim(),
        nameHindi: body.nameHindi !== undefined ? body.nameHindi : existingStudent.nameHindi,
        gender: (existingStudent.unitId === 'college' ? 'FEMALE' : input.gender) as Gender,
        dob: new Date(input.dateOfBirth),
        fatherName: input.fatherName || 'Not Provided',
        motherName: input.motherName || null,
        phone: input.phone || null,
        fatherPhone: input.guardianPhone || null,
        address: input.address || null,
        aadharNo: input.aadharNo || null,
        category: (body.category as Category) || existingStudent.category,
        admissionDate: new Date(input.admissionDate),
        status: (body.status as StudentStatus) || existingStudent.status,
        photoUrl: resolvedPhotoUrl !== undefined ? resolvedPhotoUrl : undefined,
        aadharDocUrl: resolvedAadharDocUrl !== undefined ? resolvedAadharDocUrl : undefined,
        parentAadharDocUrl: resolvedParentAadharDocUrl !== undefined ? resolvedParentAadharDocUrl : undefined,
        isFromSchool: body.isFromSchool !== undefined ? body.isFromSchool : existingStudent.isFromSchool,
      },
    });

    // Sync concession for college student if isFromSchool changed
    if (existingStudent.unitId === 'college' && body.isFromSchool !== undefined && body.isFromSchool !== existingStudent.isFromSchool) {
      if (body.isFromSchool) {
        await prisma.studentConcession.upsert({
          where: { studentId_feeComponentName: { studentId: id, feeComponentName: 'Tuition Fee' } },
          create: {
            studentId: id,
            feeComponentName: 'Tuition Fee',
            discountType: 'PERCENTAGE',
            value: 50,
            reason: 'Ex-School Student (50% Concession)',
          },
          update: {
            discountType: 'PERCENTAGE',
            value: 50,
            reason: 'Ex-School Student (50% Concession)',
          }
        });
      } else {
        try {
          await prisma.studentConcession.delete({
            where: { studentId_feeComponentName: { studentId: id, feeComponentName: 'Tuition Fee' } }
          });
        } catch (delErr) {
          // ignore if not found
        }
      }
    }

    // If status changed to GRADUATED or WITHDRAWN, terminate hostel residency
    const wasActive = existingStudent.status !== StudentStatus.GRADUATED && existingStudent.status !== StudentStatus.WITHDRAWN;
    const isNowInactive = updatedStudent.status === StudentStatus.GRADUATED || updatedStudent.status === StudentStatus.WITHDRAWN;
    if (wasActive && isNowInactive) {
      try {
        await terminateHostelResidency(id);
      } catch (hostelErr) {
        console.error(`[STUDENT_PATCH] Hostel termination failed for student ${id}:`, hostelErr);
      }
    }

    // If className has changed (e.g. manual promotion or stream change), apply new class fees and transport fees
    if (existingStudent.className !== input.classId) {
      const targetAcademicYear = '2026-27';
      const startYear = parseInt(targetAcademicYear.split('-')[0]);
      const refDate = new Date(startYear, 5, 1); // June 1st of target academic session

      try {
        await applyClassFees({
          studentId: id,
          unitId: existingStudent.unitId,
          className: input.classId,
          admissionDate: refDate,
        });
      } catch (feeErr) {
        console.error(`[STUDENT_PATCH] Fee allocation failed for student ${id}:`, feeErr);
      }

      if (existingStudent.transportMode === 'BUS_SERVICE' && existingStudent.busStationId) {
        try {
          await applyStudentTransport({
            studentId: id,
            unitId: existingStudent.unitId,
            className: input.classId,
            admissionDate: refDate,
            transportMode: existingStudent.transportMode,
            busStationId: existingStudent.busStationId,
          });
        } catch (transportErr) {
          console.error(`[STUDENT_PATCH] Transport allocation failed for student ${id}:`, transportErr);
        }
      }
    }

    // ── Update Previous Outstanding Fees ─────────────────────────────
    if (body.previousDues !== undefined) {
      const rawDues = typeof body.previousDues === 'number' ? body.previousDues : parseFloat(body.previousDues || '0');
      const duesVal = isNaN(rawDues) ? 0 : Math.max(0, rawDues);

      const existingPrevAlloc = await prisma.feeAllocation.findFirst({
        where: {
          studentId: id,
          feeComponent: {
            name: 'Previous Outstanding Fees',
          },
        },
      });

      if (existingPrevAlloc) {
        const paid = Number(existingPrevAlloc.amountPaid) || 0;
        const targetDue = Math.max(paid, duesVal);
        const newStatus = targetDue <= 0 || paid >= targetDue ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';

        await prisma.feeAllocation.update({
          where: { id: existingPrevAlloc.id },
          data: {
            amountDue: targetDue,
            status: newStatus,
          },
        });
      } else if (duesVal > 0) {
        let feeStructure = await prisma.feeStructure.findFirst({
          where: {
            unitId: existingStudent.unitId,
            className: input.classId || existingStudent.className,
          },
        });

        if (!feeStructure) {
          feeStructure = await prisma.feeStructure.findFirst({
            where: { unitId: existingStudent.unitId },
          });
        }

        if (feeStructure) {
          let prevComponent = await prisma.feeComponent.findFirst({
            where: { feeStructureId: feeStructure.id, name: 'Previous Outstanding Fees' },
          });

          if (!prevComponent) {
            prevComponent = await prisma.feeComponent.create({
              data: {
                feeStructureId: feeStructure.id,
                name: 'Previous Outstanding Fees',
                amount: 0,
              },
            });
          }

          await prisma.feeAllocation.create({
            data: {
              studentId: id,
              feeComponentId: prevComponent.id,
              amountDue: duesVal,
              amountPaid: 0,
              dueDate: new Date(),
              status: 'UNPAID',
            },
          });
        }
      }
    }

    // File operations pre-processed before database update transaction.

    // ── Audit Log ────────────────────────────────────────────────────────
    await logAuditEvent(userId, 'UPDATE', 'Student', id, {
      previousName: existingStudent.name,
      newName: updatedStudent.name,
      admissionNo: updatedStudent.admissionNo,
    });

    return NextResponse.json({ student: updatedStudent });
  } catch (error) {
    console.error('[STUDENT_DETAILS_PATCH] Internal error:', error);
    return NextResponse.json(
      { error: 'An error occurred while updating student record.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // Validate UUID format
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Invalid student ID format', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    // ── Verify authentication ─────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    // ── Verify Student Existence and RBAC Access ─────────────────────────
    const student = await prisma.student.findUnique({
      where: { id },
    });

    if (!student) {
      return NextResponse.json(
        { error: 'Student record not found', code: 'RECORD_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (!accessUnits.includes(student.unitId)) {
      return NextResponse.json(
        { error: 'Access denied for this division', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // ── Purge Attached Files from Cloudflare R2 ──────────────────────────
    try {
      if (student.photoUrl) {
        await deleteFileFromR2(student.photoUrl);
      }
      if (student.aadharDocUrl) {
        await deleteFileFromR2(student.aadharDocUrl);
      }
      if (student.parentAadharDocUrl) {
        await deleteFileFromR2(student.parentAadharDocUrl);
      }
    } catch (r2Err) {
      console.error(`[STUDENT_DELETE] Failed to purge R2 files for student ${id}:`, r2Err);
    }

    const { searchParams } = new URL(request.url);
    const permanent = searchParams.get('permanent') === 'true';

    if (permanent) {
      // Hard-delete all related records first (child dependencies first to avoid FK constraint errors)
      await prisma.$transaction([
        prisma.feePaymentDetail.deleteMany({
          where: {
            OR: [
              { feePayment: { studentId: id } },
              { feeAllocation: { studentId: id } }
            ]
          }
        }),
        prisma.hostelResident.deleteMany({ where: { studentId: id } }),
        prisma.hostelAllocation.deleteMany({ where: { studentId: id } }),
        prisma.studentConcession.deleteMany({ where: { studentId: id } }),
        prisma.feeAllocation.deleteMany({ where: { studentId: id } }),
        prisma.feePayment.deleteMany({ where: { studentId: id } }),
        prisma.transaction.deleteMany({ where: { studentId: id } }),
        prisma.studentDiscountLog.deleteMany({ where: { studentId: id } }),
        prisma.student.delete({ where: { id } }),
      ]);

      // ── Audit Log ────────────────────────────────────────────────────────
      await logAuditEvent(userId, 'DELETE', 'Student', id, {
        name: student.name,
        admissionNo: student.admissionNo,
        permanent: 'true',
      });

      return NextResponse.json({
        message: 'Student record permanently deleted.',
        student: { id },
      });
    }

    // ── Soft-Delete (Deactivate & Clear Storage References) ───────────────
    const deactivatedStudent = await prisma.student.update({
      where: { id },
      data: {
        status: StudentStatus.WITHDRAWN,
        photoUrl: null,
        aadharDocUrl: null,
        parentAadharDocUrl: null,
      },
    });

    // Terminate hostel residency if active
    try {
      await terminateHostelResidency(id);
    } catch (hostelErr) {
      console.error(`[STUDENT_DELETE] Hostel termination failed for student ${id}:`, hostelErr);
    }

    // ── Audit Log ────────────────────────────────────────────────────────
    await logAuditEvent(userId, 'DELETE', 'Student', id, {
      name: student.name,
      admissionNo: student.admissionNo,
    });

    return NextResponse.json({
      message: 'Student record successfully withdrawn/deactivated.',
      student: deactivatedStudent,
    });
  } catch (error) {
    console.error('[STUDENT_DETAILS_DELETE] Internal error:', error);
    return NextResponse.json(
      { error: 'An error occurred while deactivating student record.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
