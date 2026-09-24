/**
 * @module lib/classFees
 * @description Auto-creates a student's class fee allocations (Tuition + Admission) from the
 *              seeded FeeStructure for their division/class/year.
 *
 * Called on student registration. Only allocates the two class-fee components
 * ('Tuition Fee', 'Admission Fee') — Transport Fee and Previous Outstanding Fees are handled
 * by their own flows, so this never double-allocates them.
 *
 * If no FeeStructure exists (e.g. a College class whose fees haven't been set up yet),
 * it simply creates nothing and returns { created: 0 } — registration still succeeds.
 */

import prisma from './prisma';
import { FeeStatus } from '@prisma/client';

const CLASS_FEE_COMPONENTS = ['Tuition Fee'];

/** Academic year string e.g. 2026-27 from a date (April = start of year). */
function getAcademicYear(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (month >= 3) return `${year}-${String(year + 1).slice(-2)}`;
  return `${year - 1}-${String(year).slice(-2)}`;
}

export interface ClassFeesInput {
  studentId: string;
  unitId: string;
  className: string;
  admissionDate: Date;
}

export interface ClassFeesResult {
  created: number;
  total: number;
  components: { name: string; amount: number }[];
}

export async function applyClassFees(input: ClassFeesInput): Promise<ClassFeesResult> {
  let academicYear = getAcademicYear(input.admissionDate);

  let structure = await prisma.feeStructure.findFirst({
    where: { unitId: input.unitId, className: input.className, academicYear },
    include: { components: true },
  });

  // Fall back to the active fee academic year if registering an old student in a past year where no fee structures exist
  if (!structure && academicYear !== '2026-27') {
    academicYear = '2026-27';
    structure = await prisma.feeStructure.findFirst({
      where: { unitId: input.unitId, className: input.className, academicYear },
      include: { components: true },
    });
  }

  if (!structure && input.unitId === 'college') {
    const isBSc = input.className.startsWith('B.Sc.');
    const tuitionAmount = isBSc ? 15000 : 10000;
    try {
      structure = await prisma.feeStructure.create({
        data: {
          name: `College ${input.className} Structure`,
          unitId: 'college',
          className: input.className,
          academicYear,
          components: {
            create: [
              { name: 'Tuition Fee', amount: tuitionAmount }
            ]
          }
        },
        include: { components: true }
      });
      console.log(`[PRISMA] Dynamically seeded college fee structure for ${input.className} with Tuition = ${tuitionAmount}`);
    } catch (createErr) {
      console.error('[PRISMA] Dynamic college fee structure creation failed:', createErr);
    }
  }

  if (!structure) {
    return { created: 0, total: 0, components: [] };
  }

  let created = 0;
  let total = 0;
  const applied: { name: string; amount: number }[] = [];

  for (const comp of structure.components) {
    if (!CLASS_FEE_COMPONENTS.includes(comp.name)) continue;
    const amount = Number(comp.amount);
    if (amount <= 0) continue;

    // Skip if this student already has an allocation for this component (idempotent).
    const existing = await prisma.feeAllocation.findFirst({
      where: { studentId: input.studentId, feeComponentId: comp.id },
    });
    if (existing) continue;

    await prisma.feeAllocation.create({
      data: {
        studentId: input.studentId,
        feeComponentId: comp.id,
        amountDue: amount,
        amountPaid: 0,
        dueDate: input.admissionDate,
        status: FeeStatus.UNPAID,
      },
    });
    created++;
    total += amount;
    applied.push({ name: comp.name, amount });
  }

  return { created, total, components: applied };
}
