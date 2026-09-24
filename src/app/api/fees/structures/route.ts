/**
 * @module api/fees/structures
 * @description CRUD for FeeStructure + FeeComponent records.
 *
 * GET  — List fee structures for accessible units (optionally filtered by class/year).
 * POST — Create a new fee structure with one or more component line items.
 *
 * SECURITY:
 * - RBAC enforced: unitId must be in the user's x-user-access-units.
 * - Unique constraint on (unitId, className, academicYear) prevents duplicates.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';

const feeStructureSchema = z.object({
  unitId: z.string().min(1, 'Division is required'),
  className: z.string().min(1, 'Class is required').max(50),
  academicYear: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Academic year must be YYYY-YY format (e.g. 2025-26)'),
  name: z.string().min(1).max(200).trim(),
  components: z
    .array(
      z.object({
        name: z.string().min(1, 'Component name required').max(200).trim(),
        amount: z.preprocess(
          (v) => Number(v),
          z.number().positive('Amount must be positive')
        ),
      })
    )
    .min(1, 'At least one fee component is required'),
});

// ─── GET ─────────────────────────────────────────────────────────────────────

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
    const classParam = searchParams.get('class') || undefined;
    const yearParam = searchParams.get('year') || undefined;

    let targetUnits = accessUnits;
    if (unitParam !== 'all') {
      if (!accessUnits.includes(unitParam)) {
        return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
      }
      targetUnits = [unitParam];
    }

    const structures = await prisma.feeStructure.findMany({
      where: {
        unitId: { in: targetUnits },
        ...(classParam ? { className: classParam } : {}),
        ...(yearParam ? { academicYear: yearParam } : {}),
      },
      include: {
        components: { orderBy: { name: 'asc' } },
        unit: { select: { name: true } },
      },
      orderBy: [{ academicYear: 'desc' }, { className: 'asc' }],
    });

    return NextResponse.json({ structures });
  } catch (error) {
    console.error('[FEE_STRUCTURES_GET]', error);
    return NextResponse.json({ error: 'Failed to load fee structures.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body', code: 'INVALID_JSON' }, { status: 400 });
    }

    const validation = feeStructureSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }

    const { unitId, className, academicYear, name, components } = validation.data;

    if (!accessUnits.includes(unitId)) {
      return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
    }

    // Unique constraint check
    const existing = await prisma.feeStructure.findUnique({
      where: { unitId_className_academicYear: { unitId, className, academicYear } },
    });

    if (existing) {
      return NextResponse.json(
        {
          error: `A fee structure for Class ${className} (${academicYear}) already exists in this division.`,
          code: 'DUPLICATE_RECORD',
        },
        { status: 409 }
      );
    }

    const structure = await prisma.feeStructure.create({
      data: {
        name,
        unitId,
        className,
        academicYear,
        components: {
          create: components.map((c) => ({ name: c.name, amount: c.amount })),
        },
      },
      include: { components: true, unit: { select: { name: true } } },
    });

    await logAuditEvent(userId, 'CREATE', 'FeeStructure', structure.id, {
      name,
      unitId,
      className,
      academicYear,
      componentCount: components.length,
    });

    return NextResponse.json({ structure }, { status: 201 });
  } catch (error) {
    console.error('[FEE_STRUCTURES_POST]', error);
    return NextResponse.json({ error: 'Failed to create fee structure.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

// ─── PUT ─────────────────────────────────────────────────────────────────────

const updateFeeStructureSchema = z.object({
  id: z.string().uuid('Invalid structure ID'),
  name: z.string().min(1).max(200).trim(),
  components: z
    .array(
      z.object({
        id: z.string().uuid('Invalid component ID').optional(),
        name: z.string().min(1, 'Component name required').max(200).trim(),
        amount: z.preprocess(
          (v) => Number(v),
          z.number().positive('Amount must be positive')
        ),
      })
    )
    .min(1, 'At least one fee component is required'),
});

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body', code: 'INVALID_JSON' }, { status: 400 });
    }

    const validation = updateFeeStructureSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validation.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }

    const { id, name, components } = validation.data;

    // 1. Fetch existing fee structure
    const existingStructure = await prisma.feeStructure.findUnique({
      where: { id },
      include: { components: true },
    });

    if (!existingStructure) {
      return NextResponse.json({ error: 'Fee structure not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    // RBAC check
    if (!accessUnits.includes(existingStructure.unitId)) {
      return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
    }

    // 2. Identify updates, creations, and deletions
    const incomingComponentIds = new Set(components.map(c => c.id).filter(Boolean) as string[]);
    
    // Deletions: components in DB that are not in request, excluding dynamic ones (Outstanding Dues and Transport Fee)
    const dbComponentsToDelete = existingStructure.components.filter(
      c => c.name !== 'Previous Outstanding Fees' && 
           c.name !== 'Transport Fee' && 
           !incomingComponentIds.has(c.id)
    );

    // 3. Verify that components to be deleted have no payments made
    for (const comp of dbComponentsToDelete) {
      const paidCount = await prisma.feeAllocation.count({
        where: {
          feeComponentId: comp.id,
          amountPaid: { gt: 0 },
        },
      });
      if (paidCount > 0) {
        return NextResponse.json(
          {
            error: `Cannot delete component "${comp.name}" because some students have already made payments towards it.`,
            code: 'COMPONENT_HAS_PAYMENTS',
          },
          { status: 400 }
        );
      }
    }

    // 4. Perform updates sequentially (due to PgBouncer limits)
    // Update structure name
    await prisma.feeStructure.update({
      where: { id },
      data: { name },
    });

    // Handle deletions
    for (const comp of dbComponentsToDelete) {
      // Delete allocations first
      await prisma.feeAllocation.deleteMany({
        where: { feeComponentId: comp.id },
      });
      // Delete component
      await prisma.feeComponent.delete({
        where: { id: comp.id },
      });
    }

    // Handle updates and creations
    for (const comp of components) {
      if (comp.id) {
        // Update existing component
        const existingComp = existingStructure.components.find(c => c.id === comp.id);
        if (!existingComp) continue;

        const amountChanged = Number(existingComp.amount) !== comp.amount;
        const nameChanged = existingComp.name !== comp.name;

        if (nameChanged || amountChanged) {
          await prisma.feeComponent.update({
            where: { id: comp.id },
            data: { name: comp.name, amount: comp.amount },
          });
        }

        // Rename student concessions if name changed
        if (nameChanged) {
          const studentsInClass = await prisma.student.findMany({
            where: {
              unitId: existingStructure.unitId,
              className: existingStructure.className,
            },
            select: { id: true },
          });
          const studentIds = studentsInClass.map(s => s.id);

          await prisma.studentConcession.updateMany({
            where: {
              studentId: { in: studentIds },
              feeComponentName: existingComp.name,
            },
            data: {
              feeComponentName: comp.name,
            },
          });
        }

        // Propagate amount changes to student allocations
        if (amountChanged) {
          const allocations = await prisma.feeAllocation.findMany({
            where: { feeComponentId: comp.id },
            include: {
              student: {
                include: {
                  concessions: {
                    where: { feeComponentName: comp.name },
                  },
                },
              },
            },
          });

          for (const alloc of allocations) {
            const pct = alloc.student.concessions[0]?.discountType === 'PERCENTAGE' 
              ? Number(alloc.student.concessions[0].value) 
              : 0;
            const newAmountDue = comp.amount;
            const netDue = newAmountDue * (1 - pct / 100);
            const paid = Number(alloc.amountPaid);
            const newStatus = paid >= netDue - 0.005 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';

            await prisma.feeAllocation.update({
              where: { id: alloc.id },
              data: {
                amountDue: newAmountDue,
                status: newStatus,
              },
            });
          }
        }
      } else {
        // Create new component
        const newComp = await prisma.feeComponent.create({
          data: {
            feeStructureId: id,
            name: comp.name,
            amount: comp.amount,
          },
        });

        // Allocate to all active students in this class/division
        const students = await prisma.student.findMany({
          where: {
            unitId: existingStructure.unitId,
            className: existingStructure.className,
            status: 'ACTIVE',
          },
        });

        for (const student of students) {
          await prisma.feeAllocation.create({
            data: {
              studentId: student.id,
              feeComponentId: newComp.id,
              amountDue: comp.amount,
              amountPaid: 0,
              dueDate: student.admissionDate,
              status: 'UNPAID',
            },
          });
        }
      }
    }

    // Fetch the updated structure to return
    const updatedStructure = await prisma.feeStructure.findUnique({
      where: { id },
      include: {
        components: { orderBy: { name: 'asc' } },
        unit: { select: { name: true } },
      },
    });

    await logAuditEvent(userId, 'UPDATE', 'FeeStructure', id, {
      name,
      unitId: existingStructure.unitId,
      className: existingStructure.className,
      academicYear: existingStructure.academicYear,
      componentCount: components.length,
    });

    return NextResponse.json({ structure: updatedStructure });
  } catch (error) {
    console.error('[FEE_STRUCTURES_PUT]', error);
    return NextResponse.json({ error: 'Failed to update fee structure.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
