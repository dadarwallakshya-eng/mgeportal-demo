/**
 * @file src/app/api/students/[id]/discount/reverse/route.ts
 * @description Undo the last discount change for a (student, component) pair —
 *              restores the percentage to what it was BEFORE the most recent change.
 *
 *   POST /api/students/{id}/discount/reverse
 *   Body: { componentName: string }   (must be a real component name; no "ALL" here)
 *
 *   Behaviour:
 *     - Reads the most recent student_discount_log entry for (student, component).
 *     - Restores the concession to that log entry's prev_pct.
 *     - If prev_pct is 0 → deletes the concession row (back to no discount).
 *     - Records this reversal as a new log entry so the audit trail keeps growing.
 *
 *   If no log entry exists → 404 NO_HISTORY (nothing to reverse to).
 *
 *   Roles: same as setting a discount — DIRECTOR / PRINCIPAL / DEPARTMENT_HEAD.
 *   A reversal can lower the % below the role's normal cap (since we're going
 *   to the prior value) — we don't re-check the cap on the prior value.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAuditEvent } from '@/lib/audit';
import { DiscountType } from '@prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (!['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'].includes(userRole)) {
      return NextResponse.json(
        { error: `Your role (${userRole}) is not allowed to reverse discounts.`, code: 'FORBIDDEN_ROLE' },
        { status: 403 }
      );
    }
    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    let componentName: string | undefined;
    try {
      const body = await request.json();
      componentName = body?.componentName?.toString().trim();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 });
    }
    if (!componentName) {
      return NextResponse.json({ error: 'componentName is required.', code: 'INVALID_VALUE' }, { status: 400 });
    }

    // Confirm student + RBAC on unit.
    const student = await prisma.student.findUnique({
      where: { id }, select: { id: true, unitId: true, name: true, admissionNo: true },
    });
    if (!student) return NextResponse.json({ error: 'Student not found', code: 'NOT_FOUND' }, { status: 404 });
    if (!accessUnits.includes(student.unitId)) {
      return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
    }

    // ── Find the most recent SET action (skip prior reversal entries) ──────
    // Why: each reverse writes its own log row, and if we read the most recent
    // row blindly we'd just toggle between the last two values. By filtering
    // to is_reversal=false we always find the user's actual last action.
    const lastLog = await prisma.studentDiscountLog.findFirst({
      where: { studentId: id, componentName, isReversal: false },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastLog) {
      return NextResponse.json(
        { error: `No discount history for "${componentName}" on this student — nothing to reverse.`, code: 'NO_HISTORY' },
        { status: 404 }
      );
    }

    const prevPct = Number(lastLog.prevPct);
    const newPctBefore = Number(lastLog.newPct);

    // Look up current concession to grab the actual present value for the log
    // (in case it was tampered with between operations).
    const currentConcession = await prisma.studentConcession.findUnique({
      where: { studentId_feeComponentName: { studentId: id, feeComponentName: componentName } },
      select: { value: true },
    });
    const actualPrevPct = currentConcession ? Number(currentConcession.value) : 0;

    // ── Apply: upsert when prevPct > 0, delete when 0 ──────────────────────
    if (prevPct === 0) {
      await prisma.studentConcession.deleteMany({
        where: { studentId: id, feeComponentName: componentName },
      });
    } else {
      await prisma.studentConcession.upsert({
        where: { studentId_feeComponentName: { studentId: id, feeComponentName: componentName } },
        create: {
          studentId: id,
          feeComponentName: componentName,
          discountType: DiscountType.PERCENTAGE,
          value: prevPct,
          reason: `Reverted from ${newPctBefore}% (was ${prevPct}% before)`,
          setBy: userId,
          setByRole: userRole,
        },
        update: {
          discountType: DiscountType.PERCENTAGE,
          value: prevPct,
          reason: `Reverted from ${newPctBefore}% (was ${prevPct}% before)`,
          setBy: userId,
          setByRole: userRole,
        },
      });
    }

    // ── New audit log entry recording the reversal ─────────────────────────
    // Marked isReversal=true so the NEXT reverse call ignores it and walks
    // back to the prior SET action instead of toggling against this one.
    await prisma.studentDiscountLog.create({
      data: {
        studentId: id,
        componentName,
        prevPct: actualPrevPct,
        newPct: prevPct,
        reason: `Reversed (back to ${prevPct}% from ${actualPrevPct}%)`,
        setBy: userId,
        setByRole: userRole,
        isReversal: true,
      },
    });

    await logAuditEvent(userId, 'UPDATE', 'StudentDiscount', id, {
      action: 'reverse',
      name: student.name,
      admissionNo: student.admissionNo,
      componentName,
      restoredFrom: actualPrevPct,
      restoredTo: prevPct,
    });

    const concessions = await prisma.studentConcession.findMany({
      where: { studentId: id },
      orderBy: { feeComponentName: 'asc' },
    });

    return NextResponse.json({
      ok: true,
      reverted: { componentName, fromPct: actualPrevPct, toPct: prevPct },
      concessions,
    });
  } catch (error) {
    console.error('[STUDENT_DISCOUNT_REVERSE]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reverse discount.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
