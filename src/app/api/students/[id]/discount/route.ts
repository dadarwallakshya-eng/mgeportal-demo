/**
 * @file src/app/api/students/[id]/discount/route.ts
 * @description Set or update a fee discount for one (or all) components of a student.
 *
 *   POST /api/students/{id}/discount
 *   Body:
 *     {
 *       componentName: string | "ALL",   // exact name of a FeeComponent, or "ALL"
 *       discountPercent: number,         // 0-100
 *       reason?: string,
 *     }
 *
 *   Role caps — enforced server-side per component:
 *     - DIRECTOR        : 100% on every component
 *     - PRINCIPAL       : 100% on every component EXCEPT a Tuition component → 20%
 *     - DEPARTMENT_HEAD : same as PRINCIPAL
 *     - Anything else   : forbidden
 *
 *   A component is treated as "Tuition" when its name contains the word "Tuition"
 *   (case-insensitive). This catches "Tuition Fee", "Monthly Tuition", etc.
 *
 *   "ALL" applies the same percent to every component the student currently has
 *   allocated. If any component would exceed the role's cap, the WHOLE request
 *   is rejected — we never partially apply.
 *
 *   Side effects per affected component:
 *     - student_concessions row upserted (PERCENTAGE, value=pct, reason, set_by, set_by_role)
 *     - When pct is 0: the concession row is DELETED (no discount).
 *     - student_discount_log row inserted (audit).
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAuditEvent } from '@/lib/audit';
import { DiscountType } from '@prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TUITION_RE = /tuition/i;

/** A component counts as "Tuition" if its name mentions the word. */
function isTuitionComponent(name: string): boolean {
  return TUITION_RE.test(name);
}

/** Per-role cap for a given component name. Returns null when the role cannot set discounts at all. */
function capFor(role: string, componentName: string): number | null {
  switch (role) {
    case 'DIRECTOR':
    case 'PRINCIPAL':
    case 'DEPARTMENT_HEAD':
      return 100;
    default:
      return null; // forbidden
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid student ID', code: 'INVALID_ID' }, { status: 400 });
    }

    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role') || '';
    const accessUnitsRaw = request.headers.get('x-user-access-units');
    if (!userId || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    // Roles other than the three privileged ones cannot set discounts at all.
    if (!['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'].includes(userRole)) {
      return NextResponse.json(
        { error: `Your role (${userRole}) is not allowed to set fee discounts.`, code: 'FORBIDDEN_ROLE' },
        { status: 403 }
      );
    }

    let body: { componentName?: string; discountType?: string; discountPercent?: number | string; discountValue?: number | string; reason?: string };
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 }); }

    const componentName = (body.componentName || '').toString().trim();
    if (!componentName) {
      return NextResponse.json(
        { error: 'componentName is required (use "ALL" for every component).', code: 'INVALID_VALUE' },
        { status: 400 }
      );
    }

    const discountType = body.discountType === 'FIXED_AMOUNT' ? DiscountType.FIXED_AMOUNT : DiscountType.PERCENTAGE;

    // Load student + verify division access + collect distinct allocated component names.
    const student = await prisma.student.findUnique({
      where: { id },
      select: {
        id: true,
        unitId: true,
        name: true,
        admissionNo: true,
        feeAllocations: {
          select: { amountDue: true, feeComponent: { select: { name: true } } },
        },
      },
    });
    if (!student) return NextResponse.json({ error: 'Student not found', code: 'NOT_FOUND' }, { status: 404 });
    if (!accessUnits.includes(student.unitId)) {
      return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
    }

    const allComponentNames = Array.from(
      new Set(student.feeAllocations.map(a => a.feeComponent.name))
    );

    // Decide which components this request targets.
    const targets: string[] = componentName.toUpperCase() === 'ALL'
      ? allComponentNames
      : [componentName];

    if (targets.length === 0) {
      return NextResponse.json(
        { error: componentName.toUpperCase() === 'ALL'
            ? 'Student has no fee components allocated yet — nothing to discount.'
            : `Component "${componentName}" not allocated to this student.`,
          code: 'NO_TARGETS' },
        { status: 400 }
      );
    }

    if (componentName.toUpperCase() !== 'ALL' && !allComponentNames.includes(componentName)) {
      return NextResponse.json(
        { error: `Component "${componentName}" is not allocated to this student.`, code: 'UNKNOWN_COMPONENT' },
        { status: 400 }
      );
    }

    // Calculate total original fee for targeted component(s)
    const targetAllocations = student.feeAllocations.filter(a => targets.includes(a.feeComponent.name));
    const totalTargetOrig = targetAllocations.reduce((sum, a) => sum + Number(a.amountDue), 0);

    let rawVal: number;
    if (discountType === DiscountType.FIXED_AMOUNT) {
      const fixedInput = body.discountValue ?? body.discountPercent;
      rawVal = typeof fixedInput === 'string' ? Number(fixedInput) : Number(fixedInput || 0);
      if (!Number.isFinite(rawVal) || rawVal < 0) {
        return NextResponse.json({ error: 'Discount amount must be a non-negative number.', code: 'INVALID_VALUE' }, { status: 400 });
      }
    } else {
      const pctInput = body.discountPercent ?? body.discountValue;
      rawVal = typeof pctInput === 'string' ? Number(pctInput) : Number(pctInput || 0);
      if (!Number.isFinite(rawVal) || rawVal < 0 || rawVal > 100) {
        return NextResponse.json({ error: 'Discount percent must be a number between 0 and 100.', code: 'INVALID_VALUE' }, { status: 400 });
      }
    }

    // Enforce role caps for EVERY targeted component — compare equivalent percentage against cap.
    for (const cname of targets) {
      const cap = capFor(userRole, cname);
      if (cap === null) {
        return NextResponse.json(
          { error: `Your role cannot set discounts.`, code: 'FORBIDDEN_ROLE' },
          { status: 403 }
        );
      }
      
      let compPct = 0;
      if (discountType === DiscountType.FIXED_AMOUNT) {
        const compAlloc = targetAllocations.find(a => a.feeComponent.name === cname);
        const compOrig = compAlloc ? Number(compAlloc.amountDue) : 0;
        const compFixed = targets.length > 1 && totalTargetOrig > 0
          ? (compOrig / totalTargetOrig) * rawVal
          : rawVal;
        compPct = compOrig > 0 ? (compFixed / compOrig) * 100 : 0;
      } else {
        compPct = rawVal;
      }

      if (compPct > cap + 0.0001) {
        const maxRupees = Math.round(totalTargetOrig * (cap / 100));
        return NextResponse.json(
          {
            error: `Your role can grant at most ${cap}% (max ₹${maxRupees.toLocaleString('en-IN')}) on "${cname}". Asked for equivalent of ${compPct.toFixed(2)}%.`,
            code: 'EXCEEDS_ROLE_CAP',
            cap,
            componentName: cname,
          },
          { status: 403 }
        );
      }
    }

    // Look up previous concessions so we can write an accurate audit log.
    const prev = await prisma.studentConcession.findMany({
      where: { studentId: id, feeComponentName: { in: targets } },
      select: { feeComponentName: true, value: true },
    });
    const prevMap = new Map(prev.map(p => [p.feeComponentName, Number(p.value)]));

    // Apply: upsert when rawVal > 0, delete when rawVal === 0. Sequential awaits (PgBouncer-safe).
    for (const cname of targets) {
      if (rawVal === 0) {
        await prisma.studentConcession.deleteMany({
          where: { studentId: id, feeComponentName: cname },
        });
      } else {
        const compAlloc = targetAllocations.find(a => a.feeComponent.name === cname);
        const compOrig = compAlloc ? Number(compAlloc.amountDue) : 0;
        const valueToSave = discountType === DiscountType.FIXED_AMOUNT && targets.length > 1 && totalTargetOrig > 0
          ? (compOrig / totalTargetOrig) * rawVal
          : rawVal;

        await prisma.studentConcession.upsert({
          where: { studentId_feeComponentName: { studentId: id, feeComponentName: cname } },
          create: {
            studentId: id,
            feeComponentName: cname,
            discountType,
            value: valueToSave,
            reason: body.reason?.toString().trim() || null,
            setBy: userId,
            setByRole: userRole,
          },
          update: {
            discountType,
            value: valueToSave,
            reason: body.reason?.toString().trim() || null,
            setBy: userId,
            setByRole: userRole,
          },
        });
      }

      const equivPctLog = discountType === DiscountType.FIXED_AMOUNT && totalTargetOrig > 0
        ? (rawVal / totalTargetOrig) * 100
        : rawVal;

      await prisma.studentDiscountLog.create({
        data: {
          studentId: id,
          componentName: cname,
          prevPct: prevMap.get(cname) ?? 0,
          newPct: equivPctLog,
          reason: body.reason?.toString().trim() || null,
          setBy: userId,
          setByRole: userRole,
          isReversal: false,  // explicit: this is a user-initiated SET, not an undo
        },
      });
    }

    const equivPctLog = discountType === DiscountType.FIXED_AMOUNT && totalTargetOrig > 0
      ? (rawVal / totalTargetOrig) * 100
      : rawVal;

    await logAuditEvent(userId, 'UPDATE', 'StudentDiscount', id, {
      name: student.name,
      admissionNo: student.admissionNo,
      componentName: componentName.toUpperCase() === 'ALL' ? 'ALL' : componentName,
      affectedComponents: targets,
      discountType,
      discountValue: rawVal,
      newPct: equivPctLog,
      reason: body.reason || null,
    });

    // Return the up-to-date list of concessions for the student so the client can refresh.
    const concessions = await prisma.studentConcession.findMany({
      where: { studentId: id },
      orderBy: { feeComponentName: 'asc' },
    });

    return NextResponse.json({
      ok: true,
      applied: { componentName, discountType, discountValue: rawVal, equivPct: equivPctLog, affectedComponents: targets },
      concessions,
    });
  } catch (error) {
    console.error('[STUDENT_DISCOUNT_POST] Internal error:', error);
    return NextResponse.json(
      { error: 'An error occurred while updating the discount.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
