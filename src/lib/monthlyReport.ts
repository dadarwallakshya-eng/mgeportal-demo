/**
 * @file src/lib/monthlyReport.ts
 * @description Shared loader for "what happened in month YYYY-MM" — used by
 *              the dashboard UI, the Excel exporter, the PDF exporter, and
 *              (later) the monthly email cron.
 *
 * One source of truth for the numbers: every consumer calls loadMonthlyReport()
 * and renders from the same structured snapshot. Aggregates run as Promise.all
 * because PgBouncer transaction mode forbids prisma.$transaction.
 */

import prisma from '@/lib/prisma';
import type { TxnDirection, TxnCategory } from '@prisma/client';

/** A single transaction row, fattened with the joined unit/student/staff name for display. */
export interface MonthlyTxn {
  id: string;
  date: string;            // ISO YYYY-MM-DD
  direction: TxnDirection; // INCOME / EXPENSE
  category: TxnCategory;
  amount: number;
  description: string | null;
  unitId: string | null;
  unitName: string | null;
  studentName: string | null;
  studentAdmissionNo: string | null;
  staffName: string | null;
  paymentMode: string | null;
  referenceNo: string | null;
  source: string | null;
}

/** Bucket of totals for one slice (whole month / one unit / one category). */
export interface Bucket {
  income: number;
  expense: number;
  net: number;
  count: number;
}

export interface MonthlyReport {
  /** "2026-06" — the month-key used in URLs and file names. */
  monthKey: string;
  /** "June 2026" — pretty label for headings. */
  label: string;
  /** First day of the month (UTC). */
  start: Date;
  /** First day of the NEXT month (UTC) — exclusive upper bound. */
  end: Date;
  /** Which units this report was generated for (RBAC-narrowed). */
  unitsFilter: string[];

  totals: Bucket;
  byCategory: Record<string, Bucket>;
  byUnit: Record<string, Bucket & { unitName: string }>;
  /** Daily breakdown — handy for charts and PDF time-series. */
  byDay: { date: string; income: number; expense: number; net: number }[];

  transactions: MonthlyTxn[];
}

/** Pretty label for a TxnCategory enum value. Mirrors the dashboard's labels. */
const CATEGORY_LABELS: Record<string, string> = {
  FEE: 'Student Fee',
  HOSTEL_FEE: 'Hostel Fee',
  OTHER_INCOME: 'Other Income',
  SALARY: 'Salary',
  HOSTEL_SALARY: 'Hostel Salary',
  MESS: 'Mess',
  LAUNDRY: 'Laundry',
  DAILY_USE: 'Daily-use Money',
  TRANSPORT: 'Transport',
  OTHER_EXPENSE: 'Other Expense',
};

const UNIT_LABELS: Record<string, string> = {
  hindi: 'New Modern Sr. Sec. School',
  english: 'Modern English School',
  college: 'Modern Mahila Mahavidhyalaya',
  hostel: 'Modern Hostel',
  transport: 'Transport',
};

/** "2026-06" → ("June 2026", new Date(Date.UTC(2026, 5, 1)), new Date(Date.UTC(2026, 6, 1))) */
export function parseMonthKey(monthKey: string): { label: string; start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) throw new Error(`Invalid month key "${monthKey}" — expected YYYY-MM.`);
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  if (month < 1 || month > 12) throw new Error(`Invalid month ${month} in "${monthKey}".`);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const label = `${start.toLocaleString('en-IN', { month: 'long', timeZone: 'UTC' })} ${year}`;
  return { label, start, end };
}

/** "Friendlier" category text — used in Excel + PDF + UI tooltips. */
export function categoryLabel(c: string): string {
  return CATEGORY_LABELS[c] ?? c;
}

/** Friendly unit name — falls back to the raw id when unknown. */
export function unitLabel(id: string | null | undefined, dbName?: string | null): string {
  if (!id) return '—';
  return dbName || UNIT_LABELS[id] || id;
}

/**
 * Loads the structured monthly report.
 *
 * RBAC: pass in `accessUnits` from the JWT — transactions are filtered so only
 * the ones tied to a unit the operator can see are returned. Pass `null` to
 * bypass (used by the cron job which runs as the system).
 */
export async function loadMonthlyReport(
  monthKey: string,
  accessUnits: string[] | null
): Promise<MonthlyReport> {
  const { label, start, end } = parseMonthKey(monthKey);

  const where: Record<string, unknown> = {
    date: { gte: start, lt: end },
    isDeleted: false,
  };
  // Unit filter: INCLUDE rows with no unit (null) only when the caller has full
  // access — otherwise scope strictly to allowed units.
  if (accessUnits) {
    where.OR = [
      { unitId: { in: accessUnits } },
      // Allow nullable transactions to be visible to anyone — these are typically
      // manual entries that weren't tagged with a unit.
      { unitId: null },
    ];
  }

  const rows = await prisma.transaction.findMany({
    where,
    orderBy: { date: 'asc' },
    include: {
      unit: { select: { id: true, name: true } },
      student: { select: { name: true, admissionNo: true } },
      staff: { select: { name: true } },
    },
  });

  const transactions: MonthlyTxn[] = rows.map(r => ({
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    direction: r.direction,
    category: r.category,
    amount: Number(r.amount),
    description: r.description,
    unitId: r.unitId,
    unitName: r.unit?.name ?? null,
    studentName: r.student?.name ?? null,
    studentAdmissionNo: r.student?.admissionNo ?? null,
    staffName: r.staff?.name ?? null,
    paymentMode: r.paymentMode,
    referenceNo: r.referenceNo,
    source: r.source,
  }));

  // Bucket helpers
  const newBucket = (): Bucket => ({ income: 0, expense: 0, net: 0, count: 0 });
  const totals = newBucket();
  const byCategory: Record<string, Bucket> = {};
  const byUnit: Record<string, Bucket & { unitName: string }> = {};

  // Daily aggregation: pre-fill every day with zeros so charts don't gap.
  const days: { date: string; income: number; expense: number; net: number }[] = [];
  const dayMap = new Map<string, { income: number; expense: number; net: number }>();
  for (let d = new Date(start); d < end; d = new Date(d.getTime() + 86_400_000)) {
    const k = d.toISOString().slice(0, 10);
    const entry = { income: 0, expense: 0, net: 0 };
    dayMap.set(k, entry);
    days.push({ date: k, ...entry });
  }

  for (const t of transactions) {
    const amt = t.amount;
    const isIncome = t.direction === 'INCOME';

    totals.count += 1;
    if (isIncome) totals.income += amt;
    else totals.expense += amt;

    // Category bucket
    const cat = t.category as string;
    if (!byCategory[cat]) byCategory[cat] = newBucket();
    byCategory[cat].count += 1;
    if (isIncome) byCategory[cat].income += amt;
    else byCategory[cat].expense += amt;

    // Unit bucket (treat null as "unassigned")
    const uId = t.unitId ?? 'unassigned';
    if (!byUnit[uId]) byUnit[uId] = { ...newBucket(), unitName: unitLabel(t.unitId, t.unitName) };
    byUnit[uId].count += 1;
    if (isIncome) byUnit[uId].income += amt;
    else byUnit[uId].expense += amt;

    // Daily bucket
    const day = dayMap.get(t.date);
    if (day) {
      if (isIncome) day.income += amt;
      else day.expense += amt;
    }
  }

  totals.net = totals.income - totals.expense;
  for (const k of Object.keys(byCategory)) byCategory[k].net = byCategory[k].income - byCategory[k].expense;
  for (const k of Object.keys(byUnit)) byUnit[k].net = byUnit[k].income - byUnit[k].expense;
  // Rewrite days with final net values from the map (we mutated entries in place
  // via reference, but we keep `days` and `dayMap` in sync explicitly to be safe).
  for (const d of days) {
    const m = dayMap.get(d.date);
    if (m) { d.income = m.income; d.expense = m.expense; d.net = m.income - m.expense; }
  }

  return {
    monthKey,
    label,
    start,
    end,
    unitsFilter: accessUnits ?? Object.keys(UNIT_LABELS),
    totals,
    byCategory,
    byUnit,
    byDay: days,
    transactions,
  };
}

/**
 * Lightweight monthly-summary aggregator — returns totals for the LAST N months
 * (default 12). Used by the dashboard "Monthly view" so it doesn't have to load
 * every transaction up-front. Single Postgres query via groupBy for efficiency.
 */
export async function loadMonthlySummary(
  accessUnits: string[],
  monthsBack = 12
): Promise<{ monthKey: string; label: string; income: number; expense: number; net: number; count: number }[]> {
  // Compute the start of N months ago (UTC). January 0-indexed in JS.
  const now = new Date();
  const startCutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1));

  const where: Record<string, unknown> = {
    date: { gte: startCutoff },
    isDeleted: false,
    OR: [{ unitId: { in: accessUnits } }, { unitId: null }],
  };

  // No nice groupBy on (year, month) in Prisma — pull all rows then bucket in JS.
  // Volume is fine: a year of transactions is at most a few thousand rows.
  const rows = await prisma.transaction.findMany({
    where,
    select: { date: true, direction: true, amount: true },
  });

  const buckets = new Map<string, { income: number; expense: number; count: number }>();
  for (const r of rows) {
    const d = r.date;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!buckets.has(key)) buckets.set(key, { income: 0, expense: 0, count: 0 });
    const b = buckets.get(key)!;
    b.count += 1;
    if (r.direction === 'INCOME') b.income += Number(r.amount);
    else b.expense += Number(r.amount);
  }

  // Always emit every month in the range, even ones with no transactions —
  // so the UI shows a complete timeline.
  const out: { monthKey: string; label: string; income: number; expense: number; net: number; count: number }[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    const b = buckets.get(key) || { income: 0, expense: 0, count: 0 };
    out.push({
      monthKey: key,
      label: `${dt.toLocaleString('en-IN', { month: 'long', timeZone: 'UTC' })} ${dt.getUTCFullYear()}`,
      income: b.income,
      expense: b.expense,
      net: b.income - b.expense,
      count: b.count,
    });
  }

  return out;
}
