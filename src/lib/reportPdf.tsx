/**
 * @file src/lib/reportPdf.tsx
 * @description Server-side PDF generator for the monthly financial report.
 *
 * Uses @react-pdf/renderer — pure JS, no headless browser, fits Vercel
 * serverless size budget. Layout: branded cover, KPI table, category +
 * unit breakdowns, then every transaction listed (paginated automatically).
 *
 * Why a .tsx file: @react-pdf primitives (<Page>, <Text>, <View>) are React
 * components, so we author the document in JSX and call renderToBuffer to
 * get raw PDF bytes the API route streams back.
 */

import React from 'react';
import {
  Document, Page, Text, View, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer';
import { categoryLabel, type MonthlyReport } from '@/lib/monthlyReport';

// ── Brand colours (mirror the dashboard) ────────────────────────────────────
const C = {
  brand:    '#3A1577',
  brandFg:  '#FFFFFF',
  ink:      '#1D1B2A',
  mute:     '#8A8898',
  label:    '#4A4860',
  beige:    '#ECE6DB',
  cream:    '#FAF7F2',
  paper:    '#FFFFFF',
  emerald:  '#15803D',
  red:      '#DC2626',
  amber:    '#D97706',
};

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 36, fontSize: 9, color: C.ink, backgroundColor: C.paper, fontFamily: 'Helvetica' },
  cover: { paddingTop: 120 },
  brandHead: { color: C.brand, fontSize: 24, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  brandTag: { color: C.mute, fontSize: 11, textAlign: 'center', marginTop: 6 },
  coverDivider: { borderBottom: `2px solid ${C.brand}`, marginVertical: 24, marginHorizontal: 80 },
  coverMonth: { fontSize: 32, fontFamily: 'Helvetica-Bold', textAlign: 'center', color: C.ink },
  coverSub: { fontSize: 11, textAlign: 'center', color: C.mute, marginTop: 4 },
  coverFooter: { position: 'absolute', bottom: 36, left: 36, right: 36, fontSize: 8, color: C.mute, textAlign: 'center' },

  h1: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.brand, marginBottom: 8 },
  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.label, marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 },

  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  kpiCard: { flex: 1, padding: 10, borderRadius: 6, border: `1px solid ${C.beige}`, backgroundColor: C.cream },
  kpiLabel: { fontSize: 7, color: C.mute, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Helvetica-Bold' },
  kpiValue: { fontSize: 14, marginTop: 4, fontFamily: 'Helvetica-Bold' },

  table: { width: '100%', marginBottom: 8 },
  tr: { flexDirection: 'row', borderBottom: `0.5px solid ${C.beige}`, paddingVertical: 4 },
  trHead: { flexDirection: 'row', backgroundColor: C.brand, paddingVertical: 6, paddingHorizontal: 4 },
  th: { color: C.brandFg, fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  td: { fontSize: 8, color: C.label, paddingHorizontal: 4 },

  // Column widths for the All-Transactions table.
  cDate: { width: '11%' },
  cType: { width: '7%', textAlign: 'center' },
  cCat:  { width: '15%' },
  cDesc: { width: '37%' },
  cUnit: { width: '14%' },
  cAmt:  { width: '16%', textAlign: 'right', fontFamily: 'Helvetica-Bold' },

  // Smaller tables (category / unit)
  c2Name: { width: '40%' },
  c2Num:  { width: '20%', textAlign: 'right' },

  pillIn:  { backgroundColor: '#dcfce7', color: C.emerald, fontSize: 7, fontFamily: 'Helvetica-Bold', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  pillOut: { backgroundColor: '#fee2e2', color: C.red, fontSize: 7, fontFamily: 'Helvetica-Bold', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },

  pageFooter: { position: 'absolute', bottom: 18, left: 36, right: 36, fontSize: 7, color: C.mute, textAlign: 'center' },
});

const fmt = (n: number) => `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
//        ^ NOTE: ₹ glyph is not present in the standard Helvetica subset that @react-pdf
//          bundles, so we render "Rs." as a safe fallback. Loading a custom font that
//          ships ₹ would bloat the deploy — Rs. reads cleanly on the report.

interface Props {
  report: MonthlyReport;
  /** Optional AI-written executive summary, inserted on page 1 if present. */
  aiSummary?: string | null;
  /** ISO timestamp the report was generated. Defaults to now. */
  generatedAt?: Date;
}

function MonthlyReportDoc({ report, aiSummary, generatedAt = new Date() }: Props) {
  const r = report;
  const incomeTxns = r.transactions.filter(t => t.direction === 'INCOME');
  const expenseTxns = r.transactions.filter(t => t.direction === 'EXPENSE');

  return (
    <Document
      title={`MGE Monthly Report — ${r.label}`}
      author="MGE School Portal"
      subject={`Income & Expense report for ${r.label}`}
    >
      {/* ── COVER PAGE ───────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.cover}>
          <Text style={styles.brandHead}>Modern Group of Education</Text>
          <Text style={styles.brandTag}>"Enjoying • Believing • Achieving"</Text>
          <View style={styles.coverDivider} />
          <Text style={styles.coverMonth}>Monthly Financial Report</Text>
          <Text style={styles.coverMonth}>{r.label}</Text>
          <Text style={styles.coverSub}>
            {r.totals.count} transactions · Income {fmt(r.totals.income)} · Expense {fmt(r.totals.expense)} · Net {fmt(r.totals.net)}
          </Text>
        </View>
        <Text style={styles.coverFooter}>
          Generated {generatedAt.toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })} ·
          MGE Portal · Confidential — for internal use only
        </Text>
      </Page>

      {/* ── PAGE 2: EXECUTIVE SUMMARY + KPIs + BREAKDOWNS ────────────────── */}
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.h1}>Executive Summary</Text>

        {aiSummary ? (
          <Text style={{ marginBottom: 14, lineHeight: 1.45 }}>{aiSummary}</Text>
        ) : (
          <Text style={{ marginBottom: 14, color: C.mute, fontStyle: 'italic' }}>
            (AI-generated analysis will appear here once the Gemini API is configured.)
          </Text>
        )}

        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total Income</Text>
            <Text style={[styles.kpiValue, { color: C.emerald }]}>{fmt(r.totals.income)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total Expense</Text>
            <Text style={[styles.kpiValue, { color: C.red }]}>{fmt(r.totals.expense)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Net Balance</Text>
            <Text style={[styles.kpiValue, { color: r.totals.net >= 0 ? C.emerald : C.amber }]}>{fmt(r.totals.net)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Transactions</Text>
            <Text style={styles.kpiValue}>{r.totals.count}</Text>
          </View>
        </View>

        {/* Category breakdown */}
        <Text style={styles.h2}>Breakdown by Category</Text>
        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={[styles.th, styles.c2Name]}>Category</Text>
            <Text style={[styles.th, styles.c2Num]}>Income</Text>
            <Text style={[styles.th, styles.c2Num]}>Expense</Text>
            <Text style={[styles.th, styles.c2Num]}>Net</Text>
          </View>
          {Object.entries(r.byCategory)
            .sort((a, b) => (b[1].income + b[1].expense) - (a[1].income + a[1].expense))
            .map(([code, b]) => (
              <View key={code} style={styles.tr}>
                <Text style={[styles.td, styles.c2Name, { color: C.ink, fontFamily: 'Helvetica-Bold' }]}>{categoryLabel(code)}</Text>
                <Text style={[styles.td, styles.c2Num]}>{b.income > 0 ? fmt(b.income) : '—'}</Text>
                <Text style={[styles.td, styles.c2Num]}>{b.expense > 0 ? fmt(b.expense) : '—'}</Text>
                <Text style={[styles.td, styles.c2Num, { color: b.net >= 0 ? C.emerald : C.red, fontFamily: 'Helvetica-Bold' }]}>{fmt(b.net)}</Text>
              </View>
          ))}
        </View>

        {/* Unit breakdown */}
        <Text style={styles.h2}>Breakdown by Unit</Text>
        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={[styles.th, styles.c2Name]}>Unit / Division</Text>
            <Text style={[styles.th, styles.c2Num]}>Income</Text>
            <Text style={[styles.th, styles.c2Num]}>Expense</Text>
            <Text style={[styles.th, styles.c2Num]}>Net</Text>
          </View>
          {Object.entries(r.byUnit)
            .sort((a, b) => (b[1].income + b[1].expense) - (a[1].income + a[1].expense))
            .map(([id, b]) => (
              <View key={id} style={styles.tr}>
                <Text style={[styles.td, styles.c2Name, { color: C.ink, fontFamily: 'Helvetica-Bold' }]}>{b.unitName}</Text>
                <Text style={[styles.td, styles.c2Num]}>{b.income > 0 ? fmt(b.income) : '—'}</Text>
                <Text style={[styles.td, styles.c2Num]}>{b.expense > 0 ? fmt(b.expense) : '—'}</Text>
                <Text style={[styles.td, styles.c2Num, { color: b.net >= 0 ? C.emerald : C.red, fontFamily: 'Helvetica-Bold' }]}>{fmt(b.net)}</Text>
              </View>
          ))}
        </View>

        <Text style={styles.pageFooter} render={({ pageNumber, totalPages }) => `MGE Portal · ${r.label} · Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>

      {/* ── PAGE 3+: ALL TRANSACTIONS (paginated automatically) ──────────── */}
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.h1}>All Transactions ({r.transactions.length})</Text>
        <Text style={[styles.h2, { marginTop: 0 }]}>
          Income: {incomeTxns.length} · Expense: {expenseTxns.length}
        </Text>

        <View style={styles.table}>
          <View style={styles.trHead} fixed>
            <Text style={[styles.th, styles.cDate]}>Date</Text>
            <Text style={[styles.th, styles.cType]}>Type</Text>
            <Text style={[styles.th, styles.cCat]}>Category</Text>
            <Text style={[styles.th, styles.cDesc]}>Description</Text>
            <Text style={[styles.th, styles.cUnit]}>Unit</Text>
            <Text style={[styles.th, styles.cAmt]}>Amount</Text>
          </View>
          {r.transactions.map(t => (
            <View key={t.id} style={styles.tr} wrap={false}>
              <Text style={[styles.td, styles.cDate]}>{t.date}</Text>
              <Text style={[styles.td, styles.cType]}>
                <Text style={t.direction === 'INCOME' ? styles.pillIn : styles.pillOut}>
                  {t.direction === 'INCOME' ? 'IN' : 'OUT'}
                </Text>
              </Text>
              <Text style={[styles.td, styles.cCat]}>{categoryLabel(t.category)}</Text>
              <Text style={[styles.td, styles.cDesc]}>{t.description || ''}</Text>
              <Text style={[styles.td, styles.cUnit]}>{t.unitName || (t.unitId ?? '—')}</Text>
              <Text style={[styles.td, styles.cAmt, { color: t.direction === 'INCOME' ? C.emerald : C.red }]}>
                {t.direction === 'INCOME' ? '+' : '-'}{fmt(t.amount)}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.pageFooter} render={({ pageNumber, totalPages }) => `MGE Portal · ${r.label} · Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}

/** Render the React-PDF document tree to a Buffer of PDF bytes. */
export async function buildMonthlyPdf(report: MonthlyReport, aiSummary?: string | null): Promise<Buffer> {
  return await renderToBuffer(<MonthlyReportDoc report={report} aiSummary={aiSummary ?? null} />);
}
