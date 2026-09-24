/**
 * @module lib/finance
 * @description The simple income/expense money system — one Transaction table, balances always computed.
 *
 * Every rupee in or out of the institute is a single Transaction row. The net balance is NEVER
 * stored; it is always recomputed as (Σ income − Σ expense), so totals can never go stale.
 *
 * All modules (fees, payroll, hostel, manual entries) call `recordTransaction` to log money.
 */

import prisma from './prisma';
import { TxnDirection, TxnCategory, PaymentMode } from '@prisma/client';
import { checkInstantTransaction } from './anomalyAgent';

export interface RecordTxnInput {
  direction: TxnDirection;
  category: TxnCategory;
  amount: number;
  date: Date;
  description?: string | null;
  unitId?: string | null;
  studentId?: string | null;
  staffId?: string | null;
  hostelStaffId?: string | null;
  paymentMode?: PaymentMode | null;
  referenceNo?: string | null;
  periodMonth?: string | null;
  periodYear?: number | null;
  source?: string | null;
  receiptUrl?: string | null;
  collectorName?: string | null;
  collectorRole?: string | null;
  pfDeduction?: number | null;
  tdsDeduction?: number | null;
  createdBy: string;
}

/** Insert one income/expense transaction. Returns the created row. */
export async function recordTransaction(input: RecordTxnInput) {
  const txn = await prisma.transaction.create({
    data: {
      direction: input.direction,
      category: input.category,
      amount: input.amount,
      date: input.date,
      description: input.description ?? null,
      unitId: input.unitId ?? null,
      studentId: input.studentId ?? null,
      staffId: input.staffId ?? null,
      hostelStaffId: input.hostelStaffId ?? null,
      paymentMode: input.paymentMode ?? null,
      referenceNo: input.referenceNo ?? null,
      periodMonth: input.periodMonth ?? null,
      periodYear: input.periodYear ?? null,
      source: input.source ?? null,
      receiptUrl: input.receiptUrl ?? null,
      collectorName: input.collectorName ?? null,
      collectorRole: input.collectorRole ?? null,
      pfDeduction: input.pfDeduction ?? null,
      tdsDeduction: input.tdsDeduction ?? null,
      createdBy: input.createdBy,
    },
  });

  // Trigger instant anomaly agent check in the background
  checkInstantTransaction(txn).catch(err => console.error('[ANOMALY_CHECK_ERROR]', err));

  return txn;
}

export interface SummaryFilter {
  units?: string[];          // restrict to these unit ids (null/empty unit also included if includeNullUnit)
  from?: Date;
  to?: Date;
  includeNullUnit?: boolean; // include transactions with no unit (e.g. cross-division)
}

/**
 * Compute a live income/expense summary: totals, net, and breakdown by category.
 * `units` restricts the scope (for RBAC / division filtering).
 */
export async function getFinanceSummary(filter: SummaryFilter = {}) {
  const where: Record<string, unknown> = {
    isDeleted: false,
  };

  if (filter.units && filter.units.length > 0) {
    if (filter.includeNullUnit) {
      where.OR = [{ unitId: { in: filter.units } }, { unitId: null }];
    } else {
      where.unitId = { in: filter.units };
    }
  }
  if (filter.from || filter.to) {
    const dateFilter: Record<string, Date> = {};
    if (filter.from) dateFilter.gte = filter.from;
    if (filter.to) dateFilter.lte = filter.to;
    where.date = dateFilter;
  }

  const rows = await prisma.transaction.groupBy({
    by: ['direction', 'category'],
    where,
    _sum: { amount: true },
  });

  let totalIncome = 0;
  let totalExpense = 0;
  const byCategory: Record<string, number> = {};

  for (const r of rows) {
    const amt = Number(r._sum.amount || 0);
    byCategory[r.category] = (byCategory[r.category] || 0) + amt;
    if (r.direction === 'INCOME') totalIncome += amt;
    else totalExpense += amt;
  }

  return {
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    byCategory,
  };
}

/** Live financial summary for a single student (income received from them only). */
export async function getStudentPaid(studentId: string, category?: TxnCategory) {
  const result = await prisma.transaction.aggregate({
    where: { studentId, direction: 'INCOME', isDeleted: false, ...(category ? { category } : {}) },
    _sum: { amount: true },
  });
  return Number(result._sum.amount || 0);
}

// ═══════════════════════════════════════════════════════════════
// DIVISION-SCOPED CATEGORIES VALIDATION MAP
// ═══════════════════════════════════════════════════════════════

export const ALLOWED_CATEGORIES: Record<string, { income: string[]; expense: string[] }> = {
  hostel: {
    income: ['HOSTEL_FEE', 'OTHER_INCOME', 'SALARY_REFUND'],
    expense: ['MESS', 'LAUNDRY', 'DAILY_USE', 'OTHER_EXPENSE', 'ELECTRICITY', 'WATER', 'STATIONARY', 'MAINTENANCE', 'TELEPHONE_WIFI', 'MARKETING', 'FURNITURE', 'CLEANING', 'OFFICE_EXPENSE'],
  },
  transport: {
    income: ['OTHER_INCOME', 'SALARY_REFUND'],
    expense: ['TRANSPORT', 'OTHER_EXPENSE', 'ELECTRICITY', 'WATER', 'STATIONARY', 'MAINTENANCE', 'TELEPHONE_WIFI', 'MARKETING', 'FURNITURE', 'CLEANING', 'OFFICE_EXPENSE'],
  },
  hindi: {
    income: ['FEE', 'OTHER_INCOME', 'SALARY_REFUND'],
    expense: ['TRANSPORT', 'OTHER_EXPENSE', 'ELECTRICITY', 'WATER', 'STATIONARY', 'MAINTENANCE', 'TELEPHONE_WIFI', 'MARKETING', 'FURNITURE', 'CLEANING', 'OFFICE_EXPENSE'],
  },
  english: {
    income: ['FEE', 'OTHER_INCOME', 'SALARY_REFUND'],
    expense: ['TRANSPORT', 'OTHER_EXPENSE', 'ELECTRICITY', 'WATER', 'STATIONARY', 'MAINTENANCE', 'TELEPHONE_WIFI', 'MARKETING', 'FURNITURE', 'CLEANING', 'OFFICE_EXPENSE'],
  },
  college: {
    income: ['FEE', 'OTHER_INCOME', 'SALARY_REFUND'],
    expense: ['TRANSPORT', 'OTHER_EXPENSE', 'ELECTRICITY', 'WATER', 'STATIONARY', 'MAINTENANCE', 'TELEPHONE_WIFI', 'MARKETING', 'FURNITURE', 'CLEANING', 'OFFICE_EXPENSE'],
  },
};

export function isCategoryAllowed(unitId: string | null | undefined, direction: TxnDirection, category: TxnCategory): boolean {
  if (!unitId) return true; // Cross-division transactions allow any category
  const allowed = ALLOWED_CATEGORIES[unitId];
  if (!allowed) return true; // Fallback
  const list = direction === 'INCOME' ? allowed.income : allowed.expense;
  return list.includes(category);
}
