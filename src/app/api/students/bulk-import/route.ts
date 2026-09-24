import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateAdmissionNo } from '@/lib/admission';
import { applyClassFees } from '@/lib/classFees';
import { logAuditEvent } from '@/lib/audit';
import { encrypt } from '@/lib/encryption';
import { Gender, Category, StudentStatus } from '@prisma/client';

export const maxDuration = 120; // Support bulk batch execution times

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
    const userId = request.headers.get('x-user-id');
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);
    const { unitId, classId, sectionId, students } = await request.json();

    if (!unitId || !classId || !students || !Array.isArray(students)) {
      return NextResponse.json(
        { error: 'Invalid bulk import payload schema. Missing unitId, classId, or students array.', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    // Verify division target access scopes
    if (!accessUnits.includes(unitId)) {
      return NextResponse.json(
        { error: 'Access denied for this division', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const results = {
      total: students.length,
      successCount: 0,
      failedCount: 0,
      imported: [] as string[],
      errors: [] as { name: string; index: number; message: string }[]
    };

    // Sequential batch insertion
    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      try {
        // Validate required fields
        if (!s.firstName || !s.firstName.trim()) {
          throw new Error('First Name is required');
        }
        if (!s.dateOfBirth || isNaN(Date.parse(s.dateOfBirth))) {
          throw new Error(`Invalid Date of Birth: "${s.dateOfBirth}"`);
        }
        if (!s.motherName || !s.motherName.trim()) {
          throw new Error("Mother's Name is strictly required");
        }

        const admissionDateObj = s.admissionDate ? new Date(s.admissionDate) : new Date();

        // 1. Generate atomic admission ID
        const admissionNo = await generateAdmissionNo(unitId, admissionDateObj);

        // 2. Insert student record (bypassing photo requirement)
        const newStudent = await prisma.student.create({
          data: {
            unitId,
            admissionNo,
            srNo: s.srNo || null,
            className: classId,
            section: sectionId || '-',
            name: `${s.firstName} ${s.lastName || ''}`.trim(),
            nameHindi: s.nameHindi || null,
            gender: (s.gender || 'MALE') as Gender,
            dob: new Date(s.dateOfBirth),
            fatherName: s.fatherName || 'Not Provided',
            motherName: s.motherName.trim(),
            phone: s.phone || null,
            fatherPhone: s.fatherPhone || s.phone || null,
            address: s.address || null,
            aadharNo: s.aadharNo ? encrypt(s.aadharNo) : null,
            category: (s.category || 'GENERAL') as Category,
            photoUrl: null,
            admissionDate: admissionDateObj,
            status: StudentStatus.ACTIVE
          }
        });

        // 3. Apply standard tuition / admission fees
        try {
          await applyClassFees({
            studentId: newStudent.id,
            unitId: newStudent.unitId,
            className: newStudent.className,
            admissionDate: newStudent.admissionDate
          });
        } catch (feeErr: any) {
          console.warn(`[BULK_IMPORT] Non-fatal: failed to allocate class fees for ${newStudent.name}:`, feeErr.message || feeErr);
        }

        // 4. Create Previous Dues allocation if > 0
        const dues = s.previousDues ? parseFloat(s.previousDues) : 0;
        if (dues > 0) {
          try {
            const academicYear = getAcademicYear(admissionDateObj);

            let feeStructure = await prisma.feeStructure.findFirst({
              where: { unitId, className: classId, academicYear },
            });

            if (!feeStructure) {
              feeStructure = await prisma.feeStructure.create({
                data: {
                  name: `Fee Structure — Class ${classId} (${academicYear})`,
                  unitId,
                  className: classId,
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
                dueDate: admissionDateObj,
                status: 'UNPAID',
              },
            });
          } catch (duesErr: any) {
            console.warn(`[BULK_IMPORT] Non-fatal: failed to allocate previous outstanding fees for ${newStudent.name}:`, duesErr.message || duesErr);
          }
        }

        results.successCount++;
        results.imported.push(newStudent.name);

      } catch (err: any) {
        console.error(`[BULK_IMPORT] Row ${i + 1} registration failed:`, err);
        results.failedCount++;
        results.errors.push({
          name: s.firstName ? `${s.firstName} ${s.lastName || ''}`.trim() : `Row ${i + 1}`,
          index: i + 1,
          message: err.message || 'Unknown registration error'
        });
      }
    }

    // Audit Log the entire batch event
    await logAuditEvent(userId, 'CREATE', 'Student', null, {
      message: `Bulk imported student roster to Class ${classId} (${sectionId || '-'})`,
      unitId,
      successCount: results.successCount,
      failedCount: results.failedCount
    });

    return NextResponse.json({
      message: `Import complete. successfully imported ${results.successCount} of ${results.total} students.`,
      results
    }, { status: 200 });

  } catch (error: any) {
    console.error('[STUDENTS_BULK_IMPORT] Fatal error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred during bulk import processing.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
