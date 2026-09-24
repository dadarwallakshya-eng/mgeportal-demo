/**
 * @module api/staff
 * @description List and create staff records (Teachers, Drivers, Other Staff).
 *
 * GET  — Paginated, searchable staff list filtered to the user's accessible units.
 *         Supports filters: unit, staffType, status, search.
 * POST — Create a new staff member with full validation and audit logging.
 *
 * SECURITY: RBAC enforced — only DIRECTOR and PRINCIPAL can access.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { StaffType, EmploymentType, StaffStatus, Gender } from '@prisma/client';
import { renameFileInR2 } from '@/lib/r2';
import { generateStaffNo } from '@/lib/staffId';

// ─── Validation Schema ────────────────────────────────────────────────────────

const createStaffSchema = z.object({
  unitId: z.string().min(1, 'Division is required'),
  staffType: z.enum(['TEACHER', 'OTHER_STAFF', 'DRIVER']),
  name: z.string().min(2, 'Name is required').max(150).trim(),
  fatherName: z.string().max(150).trim().optional(),
  roleOrDesignation: z.string().max(100).trim().optional(),
  department: z.string().max(100).trim().optional(),
  subject: z.string().max(100).trim().optional(),
  phone: z.string().trim().refine(val => !val || /^\d{10}$/.test(val.replace(/\s|-/g, '')), {
    message: 'Phone number must be exactly 10 digits',
  }).optional().or(z.literal('')),
  email: z.string().email('Invalid email').max(255).trim().optional().or(z.literal('')),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'DOB must be YYYY-MM-DD').optional().or(z.literal('')),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Joining date must be YYYY-MM-DD'),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']).default('FULL_TIME'),
  monthlyBaseSalary: z.preprocess(Number, z.number().positive('Salary must be positive')),
  bankAccountNo: z.string().max(30).trim().optional(),
  aadharNo: z.string().trim().refine(val => !val || /^\d{12}$/.test(val.replace(/\s|-/g, '')), {
    message: 'Aadhar number must be exactly 12 digits',
  }).optional().or(z.literal('')),
  panNo: z.string().max(15).trim().optional(),
  photoUrl: z.string().trim().min(1, 'Staff photo is required'),
  aadharDocUrl: z.string().trim().min(1, 'Aadhar document is required'),
  panDocUrl: z.string().trim().optional().or(z.literal('')),
  otherDocUrl: z.string().trim().optional().or(z.literal('')),
  experienceYears: z.preprocess(val => (val === '' || val === null || val === undefined) ? undefined : Number(val), z.number().int().min(0).optional()),
  qualifications: z.string().max(500).trim().optional().or(z.literal('')),
  // Driver-specific
  licenseNo: z.string().max(30).trim().optional(),
  transportMode: z.string().max(50).trim().optional(),
}).superRefine((data, ctx) => {
  if ((data.staffType === 'TEACHER' || data.staffType === 'DRIVER') && !data.panDocUrl?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'PAN document is required for teachers and drivers',
      path: ['panDocUrl'],
    });
  }
});

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    if (!['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'].includes(userRole || '')) {
      return NextResponse.json({ error: 'Insufficient permissions', code: 'FORBIDDEN' }, { status: 403 });
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);
    const { searchParams } = new URL(request.url);

    const unitParam = searchParams.get('unit') || 'all';
    const typeParam = searchParams.get('type') || 'all';
    const statusParam = searchParams.get('status') || 'ACTIVE';
    const searchQuery = searchParams.get('search')?.trim() || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(10000, parseInt(searchParams.get('limit') || '20')));
    const skip = (page - 1) * limit;

    let targetUnits = accessUnits;
    if (unitParam !== 'all') {
      if (!accessUnits.includes(unitParam)) {
        return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
      }
      targetUnits = [unitParam];
    }

    let forcedType: string | null = null;
    const isHindiAccess = accessUnits.includes('hindi') || userRole === 'DIRECTOR';

    const where: any = {
      status: statusParam as StaffStatus,
    };

    if (userRole === 'DEPARTMENT_HEAD' && accessUnits.includes('transport')) {
      where.unitId = 'transport';
      where.staffType = 'DRIVER';
    } else if (isHindiAccess) {
      // Madan ji (Hindi Medium Principal) or Director: Include DRIVER staff in Hindi / All views
      if (unitParam === 'hindi' || unitParam === 'transport') {
        where.OR = [
          { unitId: 'hindi' },
          { unitId: 'transport' },
          { staffType: 'DRIVER' },
        ];
      } else if (unitParam !== 'all') {
        where.unitId = unitParam;
        if (unitParam !== 'hindi') {
          where.staffType = { not: 'DRIVER' };
        }
      } else {
        // unit === 'all'
        where.OR = [
          { unitId: { in: targetUnits } },
          { staffType: 'DRIVER' },
        ];
      }
    } else {
      // Non-Hindi Principals (English, College, etc.): Strictly exclude DRIVER staff members
      where.unitId = { in: targetUnits };
      where.staffType = { not: 'DRIVER' };
    }

    if (forcedType) {
      where.staffType = forcedType;
    } else if (typeParam !== 'all' && !where.staffType) {
      where.staffType = typeParam as StaffType;
    }

    if (searchQuery) {
      where.OR = [
        { name: { contains: searchQuery, mode: 'insensitive' } },
        { staffNo: { contains: searchQuery, mode: 'insensitive' } },
        { roleOrDesignation: { contains: searchQuery, mode: 'insensitive' } },
        { department: { contains: searchQuery, mode: 'insensitive' } },
        { phone: { contains: searchQuery, mode: 'insensitive' } },
      ];
    }

    // Note: use Promise.all instead of prisma.$transaction —
    // PgBouncer transaction mode does not support interactive transactions.
    const [staffRows, total] = await Promise.all([
      prisma.staff.findMany({
        where,
        orderBy: [{ staffType: 'asc' }, { name: 'asc' }],
        skip,
        take: limit,
        include: { unit: { select: { name: true } } },
      }),
      prisma.staff.count({ where }),
    ]);

    // Attach this month's salary status (paid / remaining) from SALARY transactions.
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const now = new Date();
    const curMonth = MONTHS[now.getMonth()];
    const curYear = now.getFullYear();
    const staff = await Promise.all(staffRows.map(async (s) => {
      const paidAgg = await prisma.transaction.aggregate({
        where: { staffId: s.id, category: 'SALARY', periodMonth: curMonth, periodYear: curYear, isDeleted: false },
        _sum: { amount: true, pfDeduction: true, tdsDeduction: true },
      });
      const lastPaymentTxn = await prisma.transaction.findFirst({
        where: { staffId: s.id, category: 'SALARY', periodMonth: curMonth, periodYear: curYear, isDeleted: false },
        orderBy: { date: 'desc' },
        select: { date: true },
      });
      const refundedAgg = await prisma.transaction.aggregate({
        where: { staffId: s.id, category: 'SALARY_REFUND', periodMonth: curMonth, periodYear: curYear, isDeleted: false },
        _sum: { amount: true },
      });
      const paidThisMonth = Number(paidAgg._sum.amount || 0) + Number(paidAgg._sum.pfDeduction || 0) + Number(paidAgg._sum.tdsDeduction || 0);
      const refundedThisMonth = Number(refundedAgg._sum.amount || 0);
      const monthly = Number(s.monthlyBaseSalary);
      return { 
        ...s, 
        paidThisMonth, 
        remainingThisMonth: Math.max(0, monthly - paidThisMonth),
        refundedThisMonth,
        lastPaymentDateThisMonth: lastPaymentTxn ? lastPaymentTxn.date : null
      };
    }));

    return NextResponse.json({
      staff,
      currentMonth: curMonth, currentYear: curYear,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[STAFF_GET]', error);
    return NextResponse.json({ error: 'Failed to load staff records.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    if (!['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'].includes(userRole || '')) {
      return NextResponse.json({ error: 'Insufficient permissions', code: 'FORBIDDEN' }, { status: 403 });
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 }); }

    const validation = createStaffSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed', code: 'VALIDATION_ERROR',
        details: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }

    const data = validation.data;

    if (!accessUnits.includes(data.unitId)) {
      return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
    }

    if (userRole === 'DEPARTMENT_HEAD' && accessUnits.includes('transport')) {
      if (data.unitId !== 'transport' || data.staffType !== 'DRIVER') {
        return NextResponse.json({ error: 'Transport HOD can only register Drivers under Transport division', code: 'FORBIDDEN' }, { status: 403 });
      }
    }

    const staffNo = await generateStaffNo(data.staffType as StaffType, new Date(data.joiningDate));

    const staff = await prisma.staff.create({
      data: {
        staffNo,
        unitId: data.unitId,
        staffType: data.staffType as StaffType,
        name: data.name,
        fatherName: data.fatherName || null,
        roleOrDesignation: data.roleOrDesignation || null,
        department: data.department || null,
        subject: data.subject || null,
        phone: data.phone || null,
        email: data.email || null,
        dob: data.dob ? new Date(data.dob) : null,
        joiningDate: new Date(data.joiningDate),
        employmentType: data.employmentType as EmploymentType,
        monthlyBaseSalary: data.monthlyBaseSalary,
        bankAccountNo: data.bankAccountNo || null,
        aadharNo: data.aadharNo || null,
        panNo: data.panNo || null,
        photoUrl: data.photoUrl || null,
        aadharDocUrl: data.aadharDocUrl || null,
        panDocUrl: data.panDocUrl || null,
        otherDocUrl: data.otherDocUrl || null,
        experienceYears: data.experienceYears ?? null,
        qualifications: data.qualifications || null,
        licenseNo: data.licenseNo || null,
        transportMode: data.transportMode || null,
        status: StaffStatus.ACTIVE,
      },
      include: { unit: { select: { name: true } } },
    });

    // ── Rename files (Google Drive or Cloudflare R2) to match the new Staff ID ──────────────────
    try {
      const safeName = staff.name.replace(/\s+/g, '_');
      const suffix = staff.id.slice(0, 8).toUpperCase();
      const baseName = `Staff_${safeName}_${suffix}`;

      const renameDoc = async (url: string | null, newName: string) => {
        if (!url) return null;
        // Cloudflare R2 key!
        const newKey = await renameFileInR2(url, newName);
        return newKey;
      };

      const newPhotoKey = await renameDoc(staff.photoUrl, `${baseName}_Photo`);
      const newAadharKey = await renameDoc(staff.aadharDocUrl, `${baseName}_Aadhar`);
      const newPanKey = await renameDoc(staff.panDocUrl, `${baseName}_PAN`);
      const newOtherKey = await renameDoc(staff.otherDocUrl, `${baseName}_Other`);

      // If R2 files were renamed, update the database columns with the new keys!
      if (newPhotoKey || newAadharKey || newPanKey || newOtherKey) {
        await prisma.staff.update({
          where: { id: staff.id },
          data: {
            photoUrl: newPhotoKey || undefined,
            aadharDocUrl: newAadharKey || undefined,
            panDocUrl: newPanKey || undefined,
            otherDocUrl: newOtherKey || undefined,
          },
        });
      }
    } catch (renameErr) {
      console.error('[STAFF_POST] Warning: File renaming/sync failed:', renameErr);
    }

    await logAuditEvent(userId, 'CREATE', 'Staff', staff.id, {
      name: staff.name, staffType: staff.staffType, unitId: staff.unitId,
    });

    return NextResponse.json({ staff }, { status: 201 });
  } catch (error) {
    console.error('[STAFF_POST]', error);
    return NextResponse.json({ error: 'Failed to create staff record.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
