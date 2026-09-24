/**
 * @module api/staff/[id]
 * @description GET, PATCH and DELETE (soft) for a single staff record.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAuditEvent } from '@/lib/audit';
import { recordTransaction } from '@/lib/finance';
import { StaffStatus, PaymentMode, StaffType } from '@prisma/client';
import { renameFileInR2, deleteFileFromR2 } from '@/lib/r2';
import { generateStaffNo, getSessionYear } from '@/lib/staffId';
import { checkTransactionDeletion } from '@/lib/anomalyAgent';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function authGuard(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const userRole = request.headers.get('x-user-role');
  const accessUnitsRaw = request.headers.get('x-user-access-units');
  if (!userId || !accessUnitsRaw) return null;
  if (!['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'].includes(userRole || '')) return null;
  return { userId, userRole, accessUnits: JSON.parse(accessUnitsRaw) as string[] };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid ID', code: 'INVALID_ID' }, { status: 400 });

  const auth = authGuard(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });

  const staff = await prisma.staff.findUnique({
    where: { id },
    include: { unit: { select: { name: true } } },
  });

  if (!staff) return NextResponse.json({ error: 'Staff record not found', code: 'NOT_FOUND' }, { status: 404 });
  const isDriverAccessForHindi = (auth.accessUnits.includes('hindi') || auth.userRole === 'DIRECTOR') && staff.staffType === 'DRIVER';
  if (!auth.accessUnits.includes(staff.unitId) && !isDriverAccessForHindi) {
    return NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 });
  }

  if (auth.userRole === 'DEPARTMENT_HEAD' && auth.accessUnits.includes('transport')) {
    if (staff.unitId !== 'transport' || staff.staffType !== 'DRIVER') {
      return NextResponse.json({ error: 'Access denied: HOD Transport can only access Drivers', code: 'FORBIDDEN' }, { status: 403 });
    }
  }

  // Month-wise salary (last 12 months) computed from SALARY transactions — same model as hostel staff.
  const now = new Date();
  const monthly = Number(staff.monthlyBaseSalary);
  const months: { 
    month: string; 
    year: number; 
    expected: number; 
    paid: number; 
    remaining: number;
    refunded: number;
    excess: number;
    remainingRefund: number;
  }[] = [];
  for (let i = 0; i < 12; i++) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = MONTHS[dt.getMonth()];
    const y = dt.getFullYear();
    const paidAgg = await prisma.transaction.aggregate({
      where: { staffId: id, category: 'SALARY', periodMonth: m, periodYear: y, isDeleted: false },
      _sum: { amount: true, pfDeduction: true, tdsDeduction: true },
    });
    const refundedAgg = await prisma.transaction.aggregate({
      where: { staffId: id, category: 'SALARY_REFUND', periodMonth: m, periodYear: y, isDeleted: false },
      _sum: { amount: true },
    });
    const paid = Number(paidAgg._sum.amount || 0) + Number(paidAgg._sum.pfDeduction || 0) + Number(paidAgg._sum.tdsDeduction || 0);
    const refunded = Number(refundedAgg._sum.amount || 0);
    const excess = Math.max(0, paid - monthly);
    const remainingRefund = Math.max(0, excess - refunded);
    months.push({ 
      month: m, 
      year: y, 
      expected: monthly, 
      paid, 
      remaining: Math.max(0, monthly - paid),
      refunded,
      excess,
      remainingRefund
    });
  }
  const totalPaidAgg = await prisma.transaction.aggregate({
    where: { staffId: id, category: 'SALARY', isDeleted: false },
    _sum: { amount: true, pfDeduction: true, tdsDeduction: true },
  });
  const totalPaid = Number(totalPaidAgg._sum.amount || 0) + Number(totalPaidAgg._sum.pfDeduction || 0) + Number(totalPaidAgg._sum.tdsDeduction || 0);

  const transactions = await prisma.transaction.findMany({
    where: { staffId: id, category: { in: ['SALARY', 'SALARY_REFUND'] }, isDeleted: false },
    orderBy: { date: 'desc' },
  });

  return NextResponse.json({ staff, months, totalPaid, transactions });
}

// Pay a month's salary (full or partial) — records a SALARY expense transaction.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid ID', code: 'INVALID_ID' }, { status: 400 });

  const auth = authGuard(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });

  const staff = await prisma.staff.findUnique({ where: { id } });
  if (!staff) return NextResponse.json({ error: 'Staff not found', code: 'NOT_FOUND' }, { status: 404 });
  const isDriverAccessForHindi = (auth.accessUnits.includes('hindi') || auth.userRole === 'DIRECTOR') && staff.staffType === 'DRIVER';
  if (!auth.accessUnits.includes(staff.unitId) && !isDriverAccessForHindi) {
    return NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 });
  }

  if (auth.userRole === 'DEPARTMENT_HEAD' && auth.accessUnits.includes('transport')) {
    if (staff.unitId !== 'transport' || staff.staffType !== 'DRIVER') {
      return NextResponse.json({ error: 'Access denied: HOD Transport can only access Drivers', code: 'FORBIDDEN' }, { status: 403 });
    }
  }

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (body.action === 'pay_salary') {
    const amount = Number(body.amount);
    if (!(amount > 0)) return NextResponse.json({ error: 'Enter a positive amount.', code: 'INVALID_AMOUNT' }, { status: 400 });
    const pfDeduction = Number(body.pfDeduction || 0);
    const tdsDeduction = Number(body.tdsDeduction || 0);
    if (pfDeduction < 0 || tdsDeduction < 0) {
      return NextResponse.json({ error: 'Deductions must be non-negative.', code: 'INVALID_AMOUNT' }, { status: 400 });
    }
    const month = body.month; const year = Number(body.year);
    if (!MONTHS.includes(month) || !year) return NextResponse.json({ error: 'Valid month and year required.', code: 'BAD_REQUEST' }, { status: 400 });
    const date = body.date ? new Date(body.date) : new Date();

    // Construct a helpful description detailing deductions
    let desc = `Salary — ${staff.name} (${month} ${year})`;
    const totalDeduction = pfDeduction + tdsDeduction;
    if (totalDeduction > 0) {
      desc += ` [Deduction: ₹${totalDeduction}]`;
    }

    await recordTransaction({
      direction: 'EXPENSE', category: 'SALARY', amount, date,
      description: desc,
      unitId: staff.unitId, staffId: id,
      paymentMode: (body.paymentMode as PaymentMode) || 'CASH',
      periodMonth: month, periodYear: year, source: 'PAYROLL', createdBy: auth.userId,
      pfDeduction, tdsDeduction,
    });

    await logAuditEvent(auth.userId, 'CREATE', 'Salary', id, { staffName: staff.name, amount, month, year, pfDeduction, tdsDeduction });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'receive_refund') {
    const amount = Number(body.amount);
    if (!(amount > 0)) return NextResponse.json({ error: 'Enter a positive amount.', code: 'INVALID_AMOUNT' }, { status: 400 });
    const month = body.month; const year = Number(body.year);
    if (!MONTHS.includes(month) || !year) return NextResponse.json({ error: 'Valid month and year required.', code: 'BAD_REQUEST' }, { status: 400 });
    const date = body.date ? new Date(body.date) : new Date();

    // 1. Calculate paid amount and received refunds so far for this month
    const paidAgg = await prisma.transaction.aggregate({
      where: { staffId: id, category: 'SALARY', periodMonth: month, periodYear: year, isDeleted: false, direction: 'EXPENSE' },
      _sum: { amount: true, pfDeduction: true, tdsDeduction: true }
    });

    const refundedAgg = await prisma.transaction.aggregate({
      where: { staffId: id, category: 'SALARY_REFUND', periodMonth: month, periodYear: year, isDeleted: false, direction: 'INCOME' },
      _sum: { amount: true }
    });

    const grossPaid = Number(paidAgg._sum.amount || 0) + Number(paidAgg._sum.pfDeduction || 0) + Number(paidAgg._sum.tdsDeduction || 0);
    const totalRefunded = Number(refundedAgg._sum.amount || 0);
    const baseSalary = Number(staff.monthlyBaseSalary);

    const excessPaid = Math.max(0, grossPaid - baseSalary);
    const remainingRefund = Math.max(0, excessPaid - totalRefunded);

    if (amount > remainingRefund + 0.01) {
      return NextResponse.json({
        error: `Refund of ₹${amount} exceeds the remaining pending refund balance of ₹${Math.round(remainingRefund)} for ${month} ${year}.`,
        code: 'REFUND_LIMIT_EXCEEDED'
      }, { status: 400 });
    }

    // 2. Record Transaction
    await recordTransaction({
      direction: 'INCOME',
      category: 'SALARY_REFUND',
      amount,
      date,
      description: `Salary Refund — Excess returned in cash by ${staff.name} (${month} ${year})`,
      unitId: staff.unitId,
      staffId: id,
      paymentMode: 'CASH',
      periodMonth: month,
      periodYear: year,
      source: 'PAYROLL',
      createdBy: auth.userId
    });

    await logAuditEvent(auth.userId, 'CREATE', 'SalaryRefund', id, { staffName: staff.name, amount, month, year });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'edit_salary_payment') {
    const { transactionId } = body;
    if (!transactionId || !UUID_REGEX.test(transactionId)) {
      return NextResponse.json({ error: 'Invalid transaction ID', code: 'INVALID_ID' }, { status: 400 });
    }

    const amount = Number(body.amount);
    const pfDeduction = Number(body.pfDeduction || 0);
    const tdsDeduction = 0;
    const paymentMode = body.paymentMode as PaymentMode;

    if (!(amount >= 0) || pfDeduction < 0) {
      return NextResponse.json({ error: 'Amounts must be non-negative.', code: 'INVALID_AMOUNT' }, { status: 400 });
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId }
    });

    if (!transaction || transaction.staffId !== id || transaction.isDeleted) {
      return NextResponse.json({ error: 'Transaction not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const date = body.date ? new Date(body.date) : undefined;

    // Construct a helpful description detailing deductions
    let desc = `Salary — ${staff.name} (${transaction.periodMonth} ${transaction.periodYear})`;
    if (pfDeduction > 0) {
      desc += ` [Deduction: ₹${pfDeduction}]`;
    }

    // Update the transaction
    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        amount,
        pfDeduction,
        tdsDeduction,
        paymentMode,
        description: desc,
        ...(date ? { date } : {}),
      }
    });

    await logAuditEvent(auth.userId, 'UPDATE', 'Salary', id, {
      staffName: staff.name,
      oldAmount: Number(transaction.amount),
      newAmount: amount,
      oldDeduction: Number(transaction.pfDeduction || 0),
      newDeduction: pfDeduction,
      month: transaction.periodMonth,
      year: transaction.periodYear,
    });

    return NextResponse.json({ ok: true });
  }

  if (body.action === 'delete_salary_payment') {
    const { transactionId } = body;
    if (!transactionId || !UUID_REGEX.test(transactionId)) {
      return NextResponse.json({ error: 'Invalid transaction ID', code: 'INVALID_ID' }, { status: 400 });
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId }
    });

    if (!transaction || transaction.staffId !== id || transaction.isDeleted) {
      return NextResponse.json({ error: 'Transaction not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    await checkTransactionDeletion(transactionId);

    // Soft-delete the transaction
    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      }
    });

    await logAuditEvent(auth.userId, 'DELETE', 'Salary', id, {
      staffName: staff.name,
      amount: Number(transaction.amount),
      month: transaction.periodMonth,
      year: transaction.periodYear,
      pfDeduction: Number(transaction.pfDeduction || 0),
      tdsDeduction: Number(transaction.tdsDeduction || 0)
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action', code: 'BAD_REQUEST' }, { status: 400 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid ID', code: 'INVALID_ID' }, { status: 400 });

  const auth = authGuard(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });

  const existing = await prisma.staff.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  if (!auth.accessUnits.includes(existing.unitId)) {
    return NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 });
  }

  if (auth.userRole === 'DEPARTMENT_HEAD' && auth.accessUnits.includes('transport')) {
    if (existing.unitId !== 'transport' || existing.staffType !== 'DRIVER') {
      return NextResponse.json({ error: 'Access denied: HOD Transport can only access Drivers', code: 'FORBIDDEN' }, { status: 403 });
    }
  }

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (body.phone !== undefined && body.phone !== null && body.phone !== '') {
    if (!/^\d{10}$/.test(body.phone.replace(/\s|-/g, ''))) {
      return NextResponse.json({ error: 'Phone number must be exactly 10 digits.', code: 'INVALID_VALUE' }, { status: 400 });
    }
  }
  if (body.aadharNo !== undefined && body.aadharNo !== null && body.aadharNo !== '') {
    if (!/^\d{12}$/.test(body.aadharNo.replace(/\s|-/g, ''))) {
      return NextResponse.json({ error: 'Aadhar number must be exactly 12 digits.', code: 'INVALID_VALUE' }, { status: 400 });
    }
  }
  if (body.joiningDate !== undefined && body.joiningDate !== null && body.joiningDate !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.joiningDate)) {
      return NextResponse.json({ error: 'Joining date must be YYYY-MM-DD.', code: 'INVALID_VALUE' }, { status: 400 });
    }
  }

  const targetStaffType = (body.staffType ?? existing.staffType) as StaffType;
  const photo = body.photoUrl !== undefined ? body.photoUrl : existing.photoUrl;
  const aadharDoc = body.aadharDocUrl !== undefined ? body.aadharDocUrl : existing.aadharDocUrl;
  const panDoc = body.panDocUrl !== undefined ? body.panDocUrl : existing.panDocUrl;

  if (targetStaffType === 'DRIVER' || targetStaffType === 'TEACHER') {
    if (!photo?.trim()) {
      return NextResponse.json({ error: 'Photo is required for teachers and drivers.', code: 'INVALID_VALUE' }, { status: 400 });
    }
    if (!aadharDoc?.trim()) {
      return NextResponse.json({ error: 'Aadhar document is required for teachers and drivers.', code: 'INVALID_VALUE' }, { status: 400 });
    }
    if (!panDoc?.trim()) {
      return NextResponse.json({ error: 'PAN document is required for teachers and drivers.', code: 'INVALID_VALUE' }, { status: 400 });
    }
  }

  let staffNo = existing.staffNo;
  if (body.joiningDate) {
    const newJoiningDate = new Date(body.joiningDate);
    const existingYear = getSessionYear(new Date(existing.joiningDate));
    const newYear = getSessionYear(newJoiningDate);
    const hasYearChanged = existingYear !== newYear;
    const hasTypeChanged = body.staffType !== undefined && body.staffType !== existing.staffType;
    if (hasYearChanged || hasTypeChanged) {
      staffNo = await generateStaffNo(targetStaffType, newJoiningDate);
    }
  } else if (body.staffType !== undefined && body.staffType !== existing.staffType) {
    staffNo = await generateStaffNo(targetStaffType, new Date(existing.joiningDate));
  }

  // ── Handle File Updates & Renames (Cloudflare R2) ──────
  const safeName = (body.name || existing.name).replace(/\s+/g, '_');
  const suffix = existing.id.slice(0, 8).toUpperCase();
  const baseName = `Staff_${safeName}_${suffix}`;

  const handleFileUpdate = async (
    newVal: string | undefined | null,
    oldVal: string | null,
    docType: string
  ): Promise<string | null | undefined> => {
    if (newVal === undefined) return undefined;
    
    if (newVal === null || newVal === '') {
      if (oldVal) {
        await deleteFileFromR2(oldVal);
      }
      return null;
    }

    if (newVal !== oldVal) {
      const targetName = `${baseName}_${docType}`;
      const finalKey = await renameFileInR2(newVal, targetName);

      if (oldVal && oldVal !== finalKey) {
        await deleteFileFromR2(oldVal);
      }
      return finalKey;
    }

    return newVal;
  };

  let resolvedPhotoUrl: string | null | undefined = undefined;
  let resolvedAadharDocUrl: string | null | undefined = undefined;
  let resolvedPanDocUrl: string | null | undefined = undefined;
  let resolvedOtherDocUrl: string | null | undefined = undefined;

  try {
    resolvedPhotoUrl = await handleFileUpdate(body.photoUrl, existing.photoUrl, 'Photo');
    resolvedAadharDocUrl = await handleFileUpdate(body.aadharDocUrl, existing.aadharDocUrl, 'Aadhar');
    resolvedPanDocUrl = await handleFileUpdate(body.panDocUrl, existing.panDocUrl, 'PAN');
    resolvedOtherDocUrl = await handleFileUpdate(body.otherDocUrl, existing.otherDocUrl, 'Other');
  } catch (fileErr) {
    console.error('[STAFF_DETAILS_PATCH] File sync failed:', fileErr);
  }

  const updated = await prisma.staff.update({
    where: { id },
    data: {
      name: body.name !== undefined ? body.name : existing.name,
      fatherName: body.fatherName !== undefined ? body.fatherName : existing.fatherName,
      roleOrDesignation: body.roleOrDesignation !== undefined ? body.roleOrDesignation : existing.roleOrDesignation,
      department: body.department !== undefined ? body.department : existing.department,
      subject: body.subject !== undefined ? body.subject : existing.subject,
      phone: body.phone !== undefined ? body.phone : existing.phone,
      email: body.email !== undefined ? body.email : existing.email,
      joiningDate: body.joiningDate ? new Date(body.joiningDate) : existing.joiningDate,
      staffNo,
      employmentType: body.employmentType !== undefined ? body.employmentType : existing.employmentType,
      monthlyBaseSalary: body.monthlyBaseSalary !== undefined ? Number(body.monthlyBaseSalary) : existing.monthlyBaseSalary,
      bankAccountNo: body.bankAccountNo !== undefined ? body.bankAccountNo : existing.bankAccountNo,
      aadharNo: body.aadharNo !== undefined ? body.aadharNo : existing.aadharNo,
      panNo: body.panNo !== undefined ? body.panNo : existing.panNo,
      photoUrl: resolvedPhotoUrl !== undefined ? resolvedPhotoUrl : undefined,
      aadharDocUrl: resolvedAadharDocUrl !== undefined ? resolvedAadharDocUrl : undefined,
      panDocUrl: resolvedPanDocUrl !== undefined ? resolvedPanDocUrl : undefined,
      otherDocUrl: resolvedOtherDocUrl !== undefined ? resolvedOtherDocUrl : undefined,
      experienceYears: body.experienceYears !== undefined ? (body.experienceYears === '' ? null : Number(body.experienceYears)) : existing.experienceYears,
      qualifications: body.qualifications !== undefined ? (body.qualifications === '' ? null : body.qualifications) : existing.qualifications,
      licenseNo: body.licenseNo !== undefined ? body.licenseNo : existing.licenseNo,
      transportMode: body.transportMode !== undefined ? body.transportMode : existing.transportMode,
      status: body.status !== undefined ? body.status : existing.status,
    },
  });

  // File operations pre-processed before database update transaction.

  await logAuditEvent(auth.userId, 'UPDATE', 'Staff', id, { name: updated.name });
  return NextResponse.json({ staff: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid ID', code: 'INVALID_ID' }, { status: 400 });

  const auth = authGuard(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });

  const existing = await prisma.staff.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  const isDriverAccessForHindi = (auth.accessUnits.includes('hindi') || auth.userRole === 'DIRECTOR') && existing.staffType === 'DRIVER';
  if (!auth.accessUnits.includes(existing.unitId) && !isDriverAccessForHindi) {
    return NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 });
  }

  if (auth.userRole === 'DEPARTMENT_HEAD' && auth.accessUnits.includes('transport')) {
    if (existing.unitId !== 'transport' || existing.staffType !== 'DRIVER') {
      return NextResponse.json({ error: 'Access denied: HOD Transport can only access Drivers', code: 'FORBIDDEN' }, { status: 403 });
    }
  }

  // ── Purge Attached Files from Cloudflare R2 ──────────────────────────
  try {
    if (existing.photoUrl) await deleteFileFromR2(existing.photoUrl);
    if (existing.aadharDocUrl) await deleteFileFromR2(existing.aadharDocUrl);
    if (existing.panDocUrl) await deleteFileFromR2(existing.panDocUrl);
    if (existing.otherDocUrl) await deleteFileFromR2(existing.otherDocUrl);
  } catch (r2Err) {
    console.error(`[STAFF_DELETE] Failed to purge R2 files for staff ${id}:`, r2Err);
  }

  // Soft delete — preserve salary slip history while freeing up Cloudflare storage
  const updated = await prisma.staff.update({
    where: { id },
    data: {
      status: StaffStatus.RESIGNED,
      photoUrl: null,
      aadharDocUrl: null,
      panDocUrl: null,
      otherDocUrl: null,
    },
  });
  await logAuditEvent(auth.userId, 'DELETE', 'Staff', id, { name: existing.name, staffType: existing.staffType });

  return NextResponse.json({ message: 'Staff member marked as resigned and storage cleaned.', staff: updated });
}
