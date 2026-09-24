/**
 * @file src/lib/reportExcel.ts
 * @description Build a formatted .xlsx workbook from a MonthlyReport.
 *
 * Layout:
 *   Sheet 1 "Summary"  — branded header + KPI table + Category & Unit breakdowns
 *   Sheet 2 "Income"   — every income transaction (date, category, description, unit, amount)
 *   Sheet 3 "Expense"  — every expense transaction (same columns)
 *   Sheet 4 "Daily"    — day-by-day income / expense / net (good for charts)
 *
 * Currency formatted as ₹#,##,##0; totals are real Excel formulas so the workbook
 * stays "live" when the director opens it in Excel.
 */

import ExcelJS from 'exceljs';
import { categoryLabel, type MonthlyReport } from '@/lib/monthlyReport';

const INR_FORMAT = '"₹"#,##,##0.00;[Red]-"₹"#,##,##0.00';
const HEADER_FILL: ExcelJS.FillPattern = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3A1577' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FFFFFFFF' }, bold: true };

/**
 * Render the workbook and return its bytes as a Node Buffer ready to stream.
 */
export async function buildMonthlyExcel(report: MonthlyReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MGE Portal';
  wb.created = new Date();

  // ── Sheet 1: Summary ─────────────────────────────────────────────────────
  const s1 = wb.addWorksheet('Summary', { properties: { defaultColWidth: 22 } });
  s1.mergeCells('A1:E1');
  s1.getCell('A1').value = 'Modern Group of Education — Monthly Financial Report';
  s1.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF3A1577' } };
  s1.getCell('A1').alignment = { horizontal: 'center' };
  s1.mergeCells('A2:E2');
  s1.getCell('A2').value = report.label;
  s1.getCell('A2').font = { size: 12, italic: true, color: { argb: 'FF4A4860' } };
  s1.getCell('A2').alignment = { horizontal: 'center' };
  s1.getRow(3).height = 6;

  // KPI block
  s1.getCell('A5').value = 'Total Income';
  s1.getCell('A6').value = 'Total Expense';
  s1.getCell('A7').value = 'Net Balance';
  s1.getCell('A8').value = 'Transactions';
  for (const c of ['A5', 'A6', 'A7', 'A8']) {
    s1.getCell(c).font = { bold: true };
    s1.getCell(c).alignment = { vertical: 'middle' };
  }
  s1.getCell('B5').value = report.totals.income;
  s1.getCell('B6').value = report.totals.expense;
  s1.getCell('B7').value = { formula: 'B5-B6' };
  s1.getCell('B8').value = report.totals.count;
  for (const c of ['B5', 'B6', 'B7']) s1.getCell(c).numFmt = INR_FORMAT;
  s1.getCell('B7').font = { bold: true, color: report.totals.net >= 0 ? { argb: 'FF15803D' } : { argb: 'FFDC2626' } };

  // Category breakdown
  s1.getCell('A10').value = 'By Category';
  s1.getCell('A10').font = { bold: true, size: 12 };
  s1.getRow(11).values = ['Category', 'Income', 'Expense', 'Net', 'Count'];
  s1.getRow(11).font = HEADER_FONT;
  s1.getRow(11).eachCell(c => { c.fill = HEADER_FILL; });
  let r = 12;
  for (const [code, b] of Object.entries(report.byCategory).sort((a, b) => (b[1].income + b[1].expense) - (a[1].income + a[1].expense))) {
    s1.getRow(r).values = [categoryLabel(code), b.income, b.expense, b.net, b.count];
    s1.getCell(`B${r}`).numFmt = INR_FORMAT;
    s1.getCell(`C${r}`).numFmt = INR_FORMAT;
    s1.getCell(`D${r}`).numFmt = INR_FORMAT;
    r += 1;
  }
  const lastCatRow = r - 1;
  // Subtotal formula row
  s1.getRow(r).values = ['TOTAL', { formula: `SUM(B12:B${lastCatRow})` }, { formula: `SUM(C12:C${lastCatRow})` }, { formula: `SUM(D12:D${lastCatRow})` }, { formula: `SUM(E12:E${lastCatRow})` }];
  s1.getRow(r).font = { bold: true };
  s1.getCell(`B${r}`).numFmt = INR_FORMAT;
  s1.getCell(`C${r}`).numFmt = INR_FORMAT;
  s1.getCell(`D${r}`).numFmt = INR_FORMAT;
  r += 3;

  // Unit breakdown
  s1.getCell(`A${r}`).value = 'By Unit / Division';
  s1.getCell(`A${r}`).font = { bold: true, size: 12 };
  r += 1;
  s1.getRow(r).values = ['Unit', 'Income', 'Expense', 'Net', 'Count'];
  s1.getRow(r).font = HEADER_FONT;
  s1.getRow(r).eachCell(c => { c.fill = HEADER_FILL; });
  r += 1;
  const unitStart = r;
  for (const [, b] of Object.entries(report.byUnit).sort((a, b) => (b[1].income + b[1].expense) - (a[1].income + a[1].expense))) {
    s1.getRow(r).values = [b.unitName, b.income, b.expense, b.net, b.count];
    s1.getCell(`B${r}`).numFmt = INR_FORMAT;
    s1.getCell(`C${r}`).numFmt = INR_FORMAT;
    s1.getCell(`D${r}`).numFmt = INR_FORMAT;
    r += 1;
  }
  s1.getRow(r).values = ['TOTAL', { formula: `SUM(B${unitStart}:B${r - 1})` }, { formula: `SUM(C${unitStart}:C${r - 1})` }, { formula: `SUM(D${unitStart}:D${r - 1})` }, { formula: `SUM(E${unitStart}:E${r - 1})` }];
  s1.getRow(r).font = { bold: true };
  s1.getCell(`B${r}`).numFmt = INR_FORMAT;
  s1.getCell(`C${r}`).numFmt = INR_FORMAT;
  s1.getCell(`D${r}`).numFmt = INR_FORMAT;

  s1.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];

  // ── Sheets 2 & 3: Income & Expense transaction lists ─────────────────────
  for (const dir of ['INCOME', 'EXPENSE'] as const) {
    const sheet = wb.addWorksheet(dir === 'INCOME' ? 'Income' : 'Expense');
    const rows = report.transactions.filter(t => t.direction === dir);

    sheet.columns = [
      { header: 'Date',         key: 'date',        width: 12 },
      { header: 'Category',     key: 'category',    width: 18 },
      { header: 'Description',  key: 'description', width: 50 },
      { header: 'Unit',         key: 'unit',        width: 22 },
      { header: 'Student / Staff', key: 'who',      width: 28 },
      { header: 'Mode',         key: 'mode',        width: 14 },
      { header: 'Reference No', key: 'ref',         width: 18 },
      { header: 'Amount',       key: 'amount',      width: 14 },
    ];
    sheet.getRow(1).font = HEADER_FONT;
    sheet.getRow(1).eachCell(c => { c.fill = HEADER_FILL; c.alignment = { vertical: 'middle' }; });

    for (const t of rows) {
      sheet.addRow({
        date: t.date,
        category: categoryLabel(t.category),
        description: t.description || '',
        unit: t.unitName || (t.unitId ?? ''),
        who: t.studentName
          ? `${t.studentName}${t.studentAdmissionNo ? ` (${t.studentAdmissionNo})` : ''}`
          : t.staffName || '',
        mode: t.paymentMode || '',
        ref: t.referenceNo || '',
        amount: t.amount,
      });
    }
    // Amount column: rupee format
    sheet.getColumn('amount').numFmt = INR_FORMAT;
    // Totals row
    const totalRow = sheet.addRow({
      date: '',
      category: 'TOTAL',
      description: '',
      unit: '',
      who: '',
      mode: '',
      ref: '',
      amount: { formula: `SUM(H2:H${rows.length + 1})` },
    });
    totalRow.font = { bold: true };
    totalRow.getCell('amount').numFmt = INR_FORMAT;
    sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
  }

  // ── Sheet 4: Daily ────────────────────────────────────────────────────────
  const sd = wb.addWorksheet('Daily');
  sd.columns = [
    { header: 'Date',    key: 'date',    width: 14 },
    { header: 'Income',  key: 'income',  width: 16 },
    { header: 'Expense', key: 'expense', width: 16 },
    { header: 'Net',     key: 'net',     width: 16 },
  ];
  sd.getRow(1).font = HEADER_FONT;
  sd.getRow(1).eachCell(c => { c.fill = HEADER_FILL; });
  for (const d of report.byDay) {
    sd.addRow({ date: d.date, income: d.income, expense: d.expense, net: d.net });
  }
  for (const col of ['income', 'expense', 'net']) sd.getColumn(col).numFmt = INR_FORMAT;
  sd.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}
