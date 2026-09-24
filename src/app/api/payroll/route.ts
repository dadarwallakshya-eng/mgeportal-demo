/**
 * @module api/payroll
 * @description List and generate monthly salary slips.
 *
 * GET  — Paginated salary slips filtered by unit/month/year/status, joined with staff.
 * POST — Generate a DRAFT salary slip for a staff member for a given month/year.
 *         Net salary = base + allowances − (PF + TDS + other deductions).
 *         No journal entry is posted at draft stage — that happens on payment (PATCH).
 *
 * SECURITY: Only DIRECTOR and PRINCIPAL.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const createSlipSchema = z.object({
  staffId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid staff ID'),
  month: z.enum(MONTHS as [string, ...string[]]),
  year: z.preprocess(Number, z.number().int().min(2000).max(2100)),
  baseSalary: z.preprocess(Number, z.number().min(0)),
  allowances: z.preprocess(Number, z.number().min(0)).default(0),
  pfDeduction: z.preprocess(Number, z.number().min(0)).default(0),
  tdsDeduction: z.preprocess(Number, z.number().min(0)).default(0),
  otherDeductions: z.preprocess(Number, z.number().min(0)).default(0),
});

function authGuard(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const userRole = request.headers.get('x-user-role');
  const accessUnitsRaw = request.headers.get('x-user-access-units');
  if (!userId || !accessUnitsRaw) return null;
  if (!['DIRECTOR', 'PRINCIPAL'].includes(userRole || '')) return null;
  return { userId, accessUnits: JSON.parse(accessUnitsRaw) as string[] };
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = authGuard(request);
    if (!auth) return NextResponse.json({ error: 'Authentication required or insufficient permissions', code: 'UNAUTHORIZED' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const unitParam = searchParams.get('unit') || 'all';
    const monthParam = searchParams.get('month') || 'all';
    const yearParam = searchParams.get('year') || 'all';
    const statusParam = searchParams.get('status') || 'all';
    const searchQuery = searchParams.get('search')?.trim() || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20')));
    const skip = (page - 1) * limit;

    let targetUnits = auth.accessUnits;
    if (unitParam !== 'all') {
      if (!auth.accessUnits.includes(unitParam)) {
        return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
      }
      targetUnits = [unitParam];
    }

    const where: any = {
      staff: {
        unitId: { in: targetUnits },
        ...(searchQuery ? { name: { contains: searchQuery, mode: 'insensitive' } } : {}),
      },
    };
    if (monthParam !== 'all') where.month = monthParam;
    if (yearParam !== 'all') where.year = parseInt(yearParam);
    if (statusParam !== 'all') where.paymentStatus = statusParam;

    const [slips, total] = await Promise.all([
      prisma.salarySlip.findMany({
        where,
        include: {
          staff: {
            select: { name: true, staffType: true, roleOrDesignation: true, unitId: true, unit: { select: { name: true } } },
          },
        },
        orderBy: [{ year: 'desc' }, { staff: { name: 'asc' } }],
        skip,
        take: limit,
      }),
      prisma.salarySlip.count({ where }),
    ]);

    // Aggregate totals for the filtered view
    const totalNet = slips.reduce((s, slip) => s + Number(slip.netSalary), 0);
    const totalPaid = slips.filter(s => s.paymentStatus === 'PAID').reduce((s, slip) => s + Number(slip.netSalary), 0);

    return NextResponse.json({
      slips,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      summary: { totalNet, totalPaid, pendingCount: slips.filter(s => s.paymentStatus !== 'PAID').length },
    });
  } catch (error) {
    console.error('[PAYROLL_GET]', error);
    return NextResponse.json({ error: 'Failed to load payroll records.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = authGuard(request);
    if (!auth) return NextResponse.json({ error: 'Authentication required or insufficient permissions', code: 'UNAUTHORIZED' }, { status: 401 });

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_JSON' }, { status: 400 }); }

    const validation = createSlipSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed', code: 'VALIDATION_ERROR',
        details: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }

    const d = validation.data;

    // Verify staff & RBAC
    const staff = await prisma.staff.findUnique({ where: { id: d.staffId } });
    if (!staff) return NextResponse.json({ error: 'Staff not found', code: 'NOT_FOUND' }, { status: 404 });
    if (!auth.accessUnits.includes(staff.unitId)) {
      return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
    }

    // Prevent duplicate slip for same staff/month/year
    const existing = await prisma.salarySlip.findUnique({
      where: { staffId_month_year: { staffId: d.staffId, month: d.month, year: d.year } },
    });
    if (existing) {
      return NextResponse.json({
        error: `A salary slip for ${staff.name} (${d.month} ${d.year}) already exists.`,
        code: 'DUPLICATE_RECORD',
      }, { status: 409 });
    }

    const netSalary = d.baseSalary + d.allowances - d.pfDeduction - d.tdsDeduction - d.otherDeductions;
    if (netSalary < 0) {
      return NextResponse.json({ error: 'Net salary cannot be negative — deductions exceed earnings.', code: 'INVALID_AMOUNT' }, { status: 400 });
    }

    const slip = await prisma.salarySlip.create({
      data: {
        staffId: d.staffId,
        month: d.month,
        year: d.year,
        baseSalary: d.baseSalary,
        allowances: d.allowances,
        pfDeduction: d.pfDeduction,
        tdsDeduction: d.tdsDeduction,
        otherDeductions: d.otherDeductions,
        netSalary,
        paymentStatus: 'DRAFT',
      },
      include: { staff: { select: { name: true, staffType: true, unit: { select: { name: true } } } } },
    });

    await logAuditEvent(auth.userId, 'CREATE', 'SalarySlip', slip.id, {
      staffName: staff.name, month: d.month, year: d.year, netSalary,
    });

    return NextResponse.json({ slip }, { status: 201 });
  } catch (error) {
    console.error('[PAYROLL_POST]', error);
    return NextResponse.json({ error: 'Failed to generate salary slip.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
