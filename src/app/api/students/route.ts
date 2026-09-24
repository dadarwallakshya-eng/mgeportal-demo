/**
 * @module api/students
 * @description API endpoint for listing and creating student records.
 *
 * SECURITY DECISIONS:
 * - GET: Returns a paginated list of students. Requires authentication and enforces RBAC
 *   by only returning students belonging to divisions/units the user has access to.
 *   Sanitizes database search inputs to prevent injection.
 * - POST: Creates a new student record. Validates all inputs using Zod. Enforces authorization
 *   by verifying the user has write access to the target division/unit.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { studentSchema } from '@/lib/validations';
import { logAuditEvent } from '@/lib/audit';
import { applyStudentTransport } from '@/lib/transport';
import { applyClassFees } from '@/lib/classFees';
import { generateAdmissionNo } from '@/lib/admission';
import { renameFileInR2 } from '@/lib/r2';
import { StudentStatus, Gender, Category } from '@prisma/client';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
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

    // ── Parse Query Parameters ────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const unitParam = searchParams.get('unit') || 'all';
    const classParam = searchParams.get('class') || undefined;
    const sectionParam = searchParams.get('section') || undefined;
    const statusParam = searchParams.get('status') || 'ACTIVE';
    const searchQuery = searchParams.get('search')?.trim() || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(10000, parseInt(searchParams.get('limit') || '5000')));
    const skip = (page - 1) * limit;

    // RBAC: Restrict query to units the user is allowed to access, unless they have hostel role
    let targetUnits = accessUnits;
    if (unitParam !== 'all') {
      if (!accessUnits.includes(unitParam) && !accessUnits.includes('hostel')) {
        return NextResponse.json(
          { error: 'Access denied for this division', code: 'FORBIDDEN' },
          { status: 403 }
        );
      }
      targetUnits = [unitParam];
    }

    const includeDues = searchParams.get('includeDues') === 'true';

    // ── Build Database Filter ─────────────────────────────────────────────
    const whereClause: any = {
      status: statusParam as StudentStatus,
    };

    const isHostelOnlyUser = accessUnits.includes('hostel') && !accessUnits.some(u => u === 'mes' || u === 'nms' || u === 'college' || u === 'all');
    if (isHostelOnlyUser) {
      whereClause.hostelResident = { isNot: null };
    } else if (unitParam !== 'all' || !accessUnits.includes('hostel')) {
      whereClause.unitId = { in: targetUnits };
    }

    if (classParam) {
      if (classParam === '2' || classParam === '2nd') {
        whereClause.className = { in: ['2', '2nd'] };
      } else if (classParam === '3' || classParam === '3rd') {
        whereClause.className = { in: ['3', '3rd'] };
      } else if (classParam === '1' || classParam === '1st') {
        whereClause.className = { in: ['1', '1st'] };
      } else {
        whereClause.className = classParam;
      }
    }

    if (sectionParam) {
      whereClause.section = sectionParam;
    }

    if (searchQuery) {
      // Search by name (case-insensitive), admission ID, father's name, or mobile numbers
      whereClause.OR = [
        { name: { contains: searchQuery, mode: 'insensitive' } },
        { nameHindi: { contains: searchQuery, mode: 'insensitive' } },
        { admissionNo: { contains: searchQuery, mode: 'insensitive' } },
        { fatherName: { contains: searchQuery, mode: 'insensitive' } },
        { phone: { contains: searchQuery, mode: 'insensitive' } },
        { fatherPhone: { contains: searchQuery, mode: 'insensitive' } },
      ];
    }

    // ── Execute Database Queries ──────────────────────────────────────────
    // Promise.all instead of $transaction — PgBouncer transaction mode forbids interactive transactions
    const [students, totalCount] = await Promise.all([
      prisma.student.findMany({
        where: whereClause,
        orderBy: [{ className: 'asc' }, { name: 'asc' }],
        skip,
        take: limit,
        include: {
          unit: {
            select: { name: true },
          },
          ...(includeDues
            ? {
                feeAllocations: {
                  include: {
                    feeComponent: true,
                  },
                },
                concessions: true,
              }
            : {}),
        },
      }),
      prisma.student.count({ where: whereClause }),
    ]);

    let returnedStudents = students;
    if (includeDues) {
      returnedStudents = students.map((student: any) => {
        const concByComponent = new Map<string, { type: string; value: number }>();
        for (const c of student.concessions || []) {
          concByComponent.set(c.feeComponentName, { type: c.discountType, value: Number(c.value) });
        }

        const balance = (student.feeAllocations || []).reduce((sum: number, a: any) => {
          const orig = Number(a.amountDue);
          const paid = Number(a.amountPaid);
          const conc = concByComponent.get(a.feeComponent.name);
          let net = orig;
          if (conc) {
            if (conc.type === 'FIXED_AMOUNT') {
              net = Math.max(0, orig - conc.value);
            } else {
              net = orig * (1 - conc.value / 100);
            }
          }
          return sum + Math.max(0, net - paid);
        }, 0);

        const { feeAllocations, concessions, ...rest } = student;
        return {
          ...rest,
          outstandingBalance: Math.round(balance * 100) / 100,
        };
      });
    }

    return NextResponse.json({
      students: returnedStudents,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('[STUDENTS_GET] Internal error:', error);
    return NextResponse.json(
      { error: 'An error occurred while retrieving student records.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

function getAcademicYear(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed: 0 = Jan, 3 = Apr
  if (month >= 3) {
    return `${year}-${String(year + 1).slice(-2)}`;
  } else {
    return `${year - 1}-${String(year).slice(-2)}`;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
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

    // Target division unitId must be passed in the request envelope
    const targetUnitId = body.unitId;
    if (!targetUnitId || !accessUnits.includes(targetUnitId)) {
      return NextResponse.json(
        { error: 'Access denied or missing division target', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // Validate the core fields with the Zod schema
    const validation = studentSchema.safeParse(body);
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

    // ── Role-based discount cap verification ──────────────────────────────
    const userRole = request.headers.get('x-user-role') || '';

    if (input.tuitionDiscountPercent && input.tuitionDiscountPercent > 0) {
      const cap = ['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'].includes(userRole) ? 100 : 0;
      if (input.tuitionDiscountPercent > cap) {
        return NextResponse.json(
          {
            error: `Your role (${userRole}) is not allowed to grant more than ${cap}% discount on Tuition Fee.`,
            code: 'VALIDATION_ERROR',
            details: [{ field: 'tuitionDiscountPercent', message: `Exceeds role cap of ${cap}%` }],
          },
          { status: 403 }
        );
      }
    }

    if (input.transportDiscountPercent && input.transportDiscountPercent > 0) {
      const cap = ['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'].includes(userRole) ? 100 : 0;
      if (input.transportDiscountPercent > cap) {
        return NextResponse.json(
          {
            error: `Your role (${userRole}) is not allowed to grant more than ${cap}% discount on Transport Fee.`,
            code: 'VALIDATION_ERROR',
            details: [{ field: 'transportDiscountPercent', message: `Exceeds role cap of ${cap}%` }],
          },
          { status: 403 }
        );
      }
    }



    // ── Auto-generate the permanent Admission ID ──────────────────────────
    // Format: <UNIT_PREFIX><SESSION_YEAR>-<NNNNN>  e.g. MES2026-00001
    // Atomic per (unit, session-year) — safe under concurrent registrations.
    let admissionNo: string;
    try {
      admissionNo = await generateAdmissionNo(targetUnitId, new Date(input.admissionDate));
    } catch (genErr) {
      console.error('[STUDENTS_POST] admission ID generation failed:', genErr);
      return NextResponse.json(
        {
          error: genErr instanceof Error ? genErr.message : 'Failed to generate Admission ID.',
          code: 'GENERATION_FAILED',
        },
        { status: 500 }
      );
    }

    // ── Map Zod Schema to Prisma database model columns ───────────────────
    // Sequential awaits instead of $transaction (PgBouncer transaction mode limitation)
    const student = await (async () => {
      // 1. Create student record
      const newStudent = await prisma.student.create({
        data: {
          unitId: targetUnitId,
          admissionNo,
          srNo: input.srNo || null,
          className: input.classId,
          section: input.sectionId,
          name: `${input.firstName} ${input.lastName}`.trim(),
          nameHindi: body.nameHindi || null,
          gender: (targetUnitId === 'college' ? 'FEMALE' : input.gender) as Gender,
          dob: new Date(input.dateOfBirth),
          fatherName: input.fatherName || 'Not Provided',
          motherName: input.motherName || null,
          phone: input.phone || null,
          fatherPhone: input.guardianPhone || null,
          address: input.address || null,
          aadharNo: input.aadharNo || null,
          category: (body.category as Category) || Category.GENERAL,
          photoUrl: input.photoUrl || null,
          aadharDocUrl: input.aadharDocUrl || null,
          parentAadharDocUrl: input.parentAadharDocUrl || null,
          admissionDate: new Date(input.admissionDate),
          status: StudentStatus.ACTIVE,
          isFromSchool: input.isFromSchool || false,
        },
      });

      // 2. Create Previous Dues allocation if > 0
      const dues = input.previousDues || 0;
      if (dues > 0) {
        const academicYear = getAcademicYear(new Date(input.admissionDate));

        let feeStructure = await prisma.feeStructure.findFirst({
          where: { unitId: targetUnitId, className: input.classId, academicYear },
        });

        if (!feeStructure) {
          feeStructure = await prisma.feeStructure.create({
            data: {
              name: `Fee Structure — Class ${input.classId} (${academicYear})`,
              unitId: targetUnitId,
              className: input.classId,
              academicYear,
            },
          });
        }

        let feeComponent = await prisma.feeComponent.findFirst({
          where: { feeStructureId: feeStructure.id, name: 'Previous Outstanding Fees' },
        });

        if (!feeComponent) {
          feeComponent = await prisma.feeComponent.create({
            data: { feeStructureId: feeStructure.id, name: 'Previous Outstanding Fees', amount: 0 },
          });
        }

        await prisma.feeAllocation.create({
          data: {
            studentId: newStudent.id,
            feeComponentId: feeComponent.id,
            amountDue: dues,
            amountPaid: 0,
            dueDate: new Date(input.admissionDate),
            status: 'UNPAID',
          },
        });
      }

      return newStudent;
    })();

    // ── Create concessions if registration-time discounts were set ─────────
    if (input.tuitionDiscountPercent && input.tuitionDiscountPercent > 0) {
      try {
        await prisma.studentConcession.create({
          data: {
            studentId: student.id,
            feeComponentName: 'Tuition Fee',
            discountType: 'PERCENTAGE',
            value: input.tuitionDiscountPercent,
            reason: 'Set at registration',
            setBy: userId,
            setByRole: userRole,
          },
        });
        await prisma.studentDiscountLog.create({
          data: {
            studentId: student.id,
            componentName: 'Tuition Fee',
            prevPct: 0,
            newPct: input.tuitionDiscountPercent,
            reason: 'Set at registration',
            setBy: userId,
            setByRole: userRole,
          },
        });
      } catch (concessionErr) {
        console.error('[STUDENTS_POST] Failed to create tuition concession:', concessionErr);
      }
    }

    if (input.transportDiscountPercent && input.transportDiscountPercent > 0) {
      try {
        await prisma.studentConcession.create({
          data: {
            studentId: student.id,
            feeComponentName: 'Transport Fee',
            discountType: 'PERCENTAGE',
            value: input.transportDiscountPercent,
            reason: 'Set at registration',
            setBy: userId,
            setByRole: userRole,
          },
        });
        await prisma.studentDiscountLog.create({
          data: {
            studentId: student.id,
            componentName: 'Transport Fee',
            prevPct: 0,
            newPct: input.transportDiscountPercent,
            reason: 'Set at registration',
            setBy: userId,
            setByRole: userRole,
          },
        });
      } catch (concessionErr) {
        console.error('[STUDENTS_POST] Failed to create transport concession:', concessionErr);
      }
    }

    // ── Auto-create class tuition + admission dues from the fee chart ───────
    try {
      await applyClassFees({
        studentId: student.id,
        unitId: student.unitId,
        className: student.className,
        admissionDate: student.admissionDate,
      });
    } catch (e) {
      console.error('[STUDENTS_POST] class fee allocation failed:', e);
      // Non-fatal — student exists; fees can be allocated later.
    }

    // ── Transport assignment (own vehicle vs bus station) ──────────────────
    // Creates a separate "Transport Fee" allocation when a station is chosen.
    if (body.transportMode === 'BUS_SERVICE' && body.busStationId) {
      try {
        await applyStudentTransport({
          studentId: student.id,
          unitId: student.unitId,
          className: student.className,
          admissionDate: student.admissionDate,
          transportMode: 'BUS_SERVICE',
          busStationId: body.busStationId,
        });
      } catch (e) {
        console.error('[STUDENTS_POST] transport assignment failed:', e);
        // Student is already created; transport can be assigned later from the profile.
      }
    }

    // ── Rename files (Google Drive or Cloudflare R2) to match the new permanent Admission ID ──
    try {
      const renameDoc = async (url: string | null, newName: string) => {
        if (!url) return null;
        // Cloudflare R2 key!
        const newKey = await renameFileInR2(url, newName);
        return newKey;
      };

      const newPhotoKey = await renameDoc(student.photoUrl, student.admissionNo);
      const newAadharKey = await renameDoc(student.aadharDocUrl, `${student.admissionNo}_Aadhar`);
      const newParentAadharKey = await renameDoc(student.parentAadharDocUrl, `${student.admissionNo}_Parent_Aadhar`);

      // If R2 files were renamed, update the database columns with the new keys!
      if (newPhotoKey || newAadharKey || newParentAadharKey) {
        await prisma.student.update({
          where: { id: student.id },
          data: {
            photoUrl: newPhotoKey || undefined,
            aadharDocUrl: newAadharKey || undefined,
            parentAadharDocUrl: newParentAadharKey || undefined,
          },
        });
      }
    } catch (renameErr) {
      console.error('[STUDENTS_POST] Warning: File renaming/sync failed:', renameErr);
    }

    // ── Audit Log ────────────────────────────────────────────────────────
    await logAuditEvent(userId, 'CREATE', 'Student', student.id, {
      name: student.name,
      admissionNo: student.admissionNo,
      unitId: student.unitId,
    });

    return NextResponse.json({ student }, { status: 201 }); // Using 201 Created or custom response envelope
  } catch (error) {
    console.error('[STUDENTS_POST] Internal error:', error);
    return NextResponse.json(
      { error: 'An error occurred while creating the student record.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
