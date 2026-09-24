/**
 * @file src/lib/email.ts
 * @description Thin wrapper around nodemailer + Gmail SMTP.
 *
 * Requires two env vars:
 *   GMAIL_USER          — the Gmail address you'll send from (e.g. modernedugrp@gmail.com)
 *   GMAIL_APP_PASSWORD  — a 16-char Google App Password (NOT your regular Gmail password)
 *
 * One-time Gmail setup:
 *   1. Enable 2-Step Verification on the account.
 *   2. https://myaccount.google.com/apppasswords → create app password named "MGE Portal"
 *   3. Paste the 16-char code (no spaces) into GMAIL_APP_PASSWORD.
 *
 * Gmail SMTP limits: 500 emails/day per account — plenty for one monthly report.
 */

import nodemailer from 'nodemailer';
import type { Attachment } from 'nodemailer/lib/mailer';

let cachedTransporter: nodemailer.Transporter | null = null;

/** Returns a singleton transporter; lazy-creates on first use. */
function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || '465');
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('SMTP credentials (SMTP_USER/SMTP_PASSWORD) or Gmail credentials (GMAIL_USER/GMAIL_APP_PASSWORD) must be set in env.');
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return cachedTransporter;
}

export interface SendEmailInput {
  /** One or more recipient addresses. Comma-separated string OR array. */
  to: string | string[];
  /** Optional CC list. */
  cc?: string | string[];
  subject: string;
  /** HTML email body. */
  html: string;
  /** Plain-text fallback for clients that don't render HTML. */
  text?: string;
  /** Optional attachments — e.g. the monthly PDF. */
  attachments?: Attachment[];
  /** Optional override; defaults to "MGE Portal <SMTP_USER>". */
  from?: string;
}

/** Sends one email. Returns the messageId on success; throws on failure. */
export async function sendEmail(input: SendEmailInput): Promise<{ messageId: string; accepted: string[]; rejected: string[] }> {
  const transporter = getTransporter();
  const defaultSender = process.env.SMTP_USER || process.env.GMAIL_USER || 'no-reply@modernedugrp.in';
  const from = input.from || `"MGE Portal" <${defaultSender}>`;
  const info = await transporter.sendMail({
    from,
    to: Array.isArray(input.to) ? input.to.join(', ') : input.to,
    cc: input.cc ? (Array.isArray(input.cc) ? input.cc.join(', ') : input.cc) : undefined,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
  });
  return {
    messageId: info.messageId,
    accepted: Array.isArray(info.accepted) ? info.accepted.map(String) : [],
    rejected: Array.isArray(info.rejected) ? info.rejected.map(String) : [],
  };
}

/** Quick "are creds even set?" check used by routes before they do heavy work. */
export function isEmailConfigured(): boolean {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD;
  return !!user && !!pass;
}
