/**
 * @file src/lib/sendMonthlyReport.ts
 * @description End-to-end "build the report, ask AI, render the PDF, send the email"
 *              pipeline. One function used by both the monthly cron and the manual
 *              "Send Now" button so behaviour stays identical.
 *
 *   sendMonthlyReport({ monthKey: '2026-05' })
 *
 *   Returns a summary of what happened (recipients, message id, attachment size,
 *   whether AI was used). On any unrecoverable error it throws — callers catch
 *   and surface the message.
 */

import { loadMonthlyReport, parseMonthKey } from '@/lib/monthlyReport';
import { generateExecutiveSummary } from '@/lib/aiInsights';
import { buildMonthlyPdf } from '@/lib/reportPdf';
import { sendEmail, isEmailConfigured } from '@/lib/email';

export interface SendMonthlyReportOptions {
  /** YYYY-MM of the month to report on. Required. */
  monthKey: string;
  /** Override recipients. Defaults to REPORT_RECIPIENT env var. */
  recipients?: string[];
  /** Optional CC list. */
  cc?: string[];
}

export interface SendMonthlyReportResult {
  monthKey: string;
  monthLabel: string;
  to: string[];
  messageId: string;
  pdfBytes: number;
  usedAi: boolean;
  totals: { income: number; expense: number; net: number; count: number };
}

/** Compute "previous month" key for a given YYYY-MM. */
function previousMonthKey(monthKey: string): string {
  const { start } = parseMonthKey(monthKey);
  const prev = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Render the email's HTML body. We keep it deliberately simple — a brand header,
 * the AI summary (or fallback), a tiny KPI table, and a sign-off. No fancy CSS:
 * Gmail's HTML support is restrictive.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildEmailHtml(args: {
  monthLabel: string;
  summary: string;
  income: number;
  expense: number;
  net: number;
  count: number;
}): string {
  const { monthLabel, summary, income, expense, net, count } = args;
  const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-IN')}`;
  const netColor = net >= 0 ? '#15803D' : '#D97706';
  // Convert summary paragraphs (already plain text, newline-separated) into HTML <p>s.
  const summaryHtml = summary
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p style="margin:0 0 14px 0;color:#1d1b2a;line-height:1.55">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#faf7f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1b2a">
  <div style="max-width:640px;margin:0 auto;padding:24px">
    <div style="background:#3a1577;color:#fff;padding:20px;border-radius:8px 8px 0 0">
      <div style="font-size:18px;font-weight:bold">Modern Group of Education</div>
      <div style="font-size:13px;opacity:0.85;margin-top:2px">Monthly Financial Report &middot; ${monthLabel}</div>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #ece6db;border-top:none;border-radius:0 0 8px 8px">
      <p style="margin:0 0 16px 0;color:#4a4860;font-size:14px">Namaste Director-ji,</p>
      <p style="margin:0 0 18px 0;color:#4a4860;font-size:14px">
        Here is the income &amp; expense summary for <strong>${monthLabel}</strong>. The full PDF report
        (every transaction listed, category &amp; unit breakdowns) is attached.
      </p>

      <table style="width:100%;border-collapse:collapse;margin:0 0 22px 0;font-size:13px">
        <tr><td style="padding:8px 0;color:#8a8898">Total Income</td><td style="padding:8px 0;text-align:right;font-weight:bold;color:#15803D;font-family:monospace">${fmt(income)}</td></tr>
        <tr><td style="padding:8px 0;color:#8a8898">Total Expense</td><td style="padding:8px 0;text-align:right;font-weight:bold;color:#DC2626;font-family:monospace">${fmt(expense)}</td></tr>
        <tr><td style="padding:8px 0;color:#8a8898;border-top:1px solid #ece6db">Net Balance</td><td style="padding:8px 0;text-align:right;font-weight:bold;color:${netColor};font-family:monospace;border-top:1px solid #ece6db">${fmt(net)}</td></tr>
        <tr><td style="padding:8px 0;color:#8a8898">Transactions</td><td style="padding:8px 0;text-align:right;color:#4a4860;font-family:monospace">${count}</td></tr>
      </table>

      <div style="background:#faf7f2;border:1px solid #ece6db;border-radius:6px;padding:16px;margin-bottom:18px">
        <div style="font-size:11px;font-weight:bold;color:#8a8898;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px">Executive Summary</div>
        <div style="font-size:13px">${summaryHtml}</div>
      </div>

      <p style="margin:0;color:#8a8898;font-size:12px;line-height:1.5">
        &mdash; Automated report from MGE Portal. This email and its attachment contain confidential financial data; please do not forward outside the management team.
      </p>
    </div>
    <p style="text-align:center;color:#8a8898;font-size:11px;margin:16px 0 0 0">
      Generated ${new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}
    </p>
  </div>
</body></html>`;
}

/** Plain-text fallback body. Most modern clients use the HTML, but we ship both for safety. */
function buildEmailText(args: { monthLabel: string; summary: string; income: number; expense: number; net: number }): string {
  const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-IN')}`;
  return `Modern Group of Education
Monthly Financial Report - ${args.monthLabel}

Namaste Director-ji,

Here is the income & expense summary for ${args.monthLabel}.

  Total Income:  ${fmt(args.income)}
  Total Expense: ${fmt(args.expense)}
  Net Balance:   ${fmt(args.net)}

Executive Summary
-----------------
${args.summary}

The full PDF report (with every transaction listed) is attached.

-- Automated report from MGE Portal`;
}

/** Static fallback summary used when Gemini isn't configured or fails. */
function fallbackSummary(monthLabel: string, current: { income: number; expense: number; net: number; count: number }): string {
  const trend = current.net >= 0 ? 'in surplus' : 'in deficit';
  return `During ${monthLabel} the institute recorded ${current.count} transactions, totalling Rs. ${Math.round(current.income).toLocaleString('en-IN')} in income and Rs. ${Math.round(current.expense).toLocaleString('en-IN')} in expense. The month closed ${trend} at Rs. ${Math.round(Math.abs(current.net)).toLocaleString('en-IN')}.

A detailed transaction-by-transaction breakdown is included in the attached PDF.

Note: AI-generated commentary is currently unavailable (the GEMINI_API_KEY environment variable is not configured, or the request to Gemini failed). The numbers above are computed directly from the ledger.`;
}

export async function sendMonthlyReport(opts: SendMonthlyReportOptions): Promise<SendMonthlyReportResult> {
  if (!isEmailConfigured()) {
    throw new Error('Email not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env, then redeploy.');
  }

  const recipients = opts.recipients?.length
    ? opts.recipients
    : (process.env.REPORT_RECIPIENT || '').split(',').map(s => s.trim()).filter(Boolean);
  if (recipients.length === 0) {
    throw new Error('No recipient configured. Set REPORT_RECIPIENT in .env (or pass recipients explicitly).');
  }

  // Load the current month and the previous month (for comparison) in parallel.
  const prevKey = previousMonthKey(opts.monthKey);
  const [current, previous] = await Promise.all([
    loadMonthlyReport(opts.monthKey, null),     // System scope — cron / authorised endpoints already verified the caller
    loadMonthlyReport(prevKey, null).catch(() => null),
  ]);

  // Ask Gemini for insights; fall back to a static summary if anything goes wrong.
  const aiSummary = await generateExecutiveSummary(current, previous);
  const finalSummary = aiSummary || fallbackSummary(current.label, current.totals);

  // Build the PDF with the AI summary baked into page 2.
  const pdfBuffer = await buildMonthlyPdf(current, finalSummary);

  const safeMonth = opts.monthKey.replace('-', '_');
  const subject = `MGE Portal · Monthly Report · ${current.label}`;
  const html = buildEmailHtml({
    monthLabel: current.label, summary: finalSummary,
    income: current.totals.income, expense: current.totals.expense, net: current.totals.net, count: current.totals.count,
  });
  const text = buildEmailText({
    monthLabel: current.label, summary: finalSummary,
    income: current.totals.income, expense: current.totals.expense, net: current.totals.net,
  });

  const sendResult = await sendEmail({
    from: '"MGE Accounts" <accounts@modernedugrp.in>',
    to: recipients,
    cc: opts.cc,
    subject,
    html,
    text,
    attachments: [{
      filename: `MGE_Monthly_Report_${safeMonth}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  });

  return {
    monthKey: opts.monthKey,
    monthLabel: current.label,
    to: recipients,
    messageId: sendResult.messageId,
    pdfBytes: pdfBuffer.length,
    usedAi: !!aiSummary,
    totals: { ...current.totals },
  };
}
