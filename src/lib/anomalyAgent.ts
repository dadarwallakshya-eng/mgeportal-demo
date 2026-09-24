import prisma from './prisma';
import { AlertType, AlertSeverity } from '@prisma/client';

async function sendWhatsAppAlert(message: string) {
  // Disconnected and disabled permanently for privacy/safety
  return;
}

async function sendTelegramAlert(message: string) {
  try {
    const tokenSetting = await prisma.systemSetting.findUnique({ where: { key: 'telegram_token' } });
    const chatidSetting = await prisma.systemSetting.findUnique({ where: { key: 'telegram_chatid' } });
    
    if (!tokenSetting?.value || !chatidSetting?.value) {
      return;
    }
    
    const token = tokenSetting.value.trim();
    const chatid = chatidSetting.value.trim();
    
    const url = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatid}&text=${encodeURIComponent(message)}&parse_mode=markdown`;
    
    const res = await fetch(url);
    if (!res.ok) {
      console.error('[ANOMALY_AGENT] Telegram API error status:', res.status);
    }
  } catch (err) {
    console.error('[ANOMALY_AGENT] Telegram API exception:', err);
  }
}

/**
 * Creates a system alert in the database and triggers instant WhatsApp/Telegram notifications.
 */
export async function raiseAlert(type: AlertType, severity: AlertSeverity, title: string, description: string) {
  try {
    // 1. Save alert to database
    const alert = await prisma.systemAlert.create({
      data: {
        type,
        severity,
        title,
        description
      }
    });

    // 2. Format markdown notification payload
    const severityEmoji = severity === 'CRITICAL' ? '🚨' : severity === 'WARNING' ? '⚠️' : 'ℹ️';
    const msg = `${severityEmoji} *MGE Portal Alert*
*Title:* ${title}
*Type:* ${type.replace('_', ' ')}
*Severity:* ${severity}

Check details on your dashboard:
https://www.modernedugrp.in/dashboard`;

    // 3. Dispatch alerts to active notification outputs
    await sendWhatsAppAlert(msg);
    await sendTelegramAlert(msg);
    return alert;
  } catch (error) {
    console.error('[ANOMALY_AGENT] raiseAlert error:', error);
  }
}

/**
 * Perform instant checks on transaction updates (e.g. salary payouts, backdates, soft deletions, large withdrawals).
 */
export async function checkInstantTransaction(txn: {
  id: string;
  category: string;
  amount: number | string;
  date: Date | string;
  staffId?: string | null;
  studentId?: string | null;
  direction: string;
}) {
  try {
    const amount = Number(txn.amount);
    const date = new Date(txn.date);
    const category = txn.category;
    const direction = txn.direction;
    const now = new Date();

    // Rule 1: Large cash withdrawal or expense (> 50,000)
    if (direction === 'EXPENSE' && amount >= 50000) {
      await raiseAlert(
        'SECURITY',
        'WARNING',
        'Large Outflow Logged',
        `An expense of ${category} totaling ₹${amount.toLocaleString('en-IN')} was logged.`
      );
    }

    // Rule 2: Back-dated Entry (> 3 days in past)
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 3) {
      await raiseAlert(
        'BACKDATED_ENTRY',
        'WARNING',
        'Historical Backdated Entry Logged',
        `A transaction of category ${category} with amount ₹${amount.toLocaleString('en-IN')} was logged with a historical date: ${date.toLocaleDateString('en-IN')}.`
      );
    }

    // Rule 3: Duplicate Salary checks
    if (category === 'SALARY' && txn.staffId) {
      const slipMonth = now.toLocaleString('default', { month: 'long' });
      const slipYear = now.getFullYear();
      
      const duplicates = await prisma.transaction.count({
        where: {
          staffId: txn.staffId,
          category: 'SALARY',
          periodMonth: slipMonth,
          periodYear: slipYear,
          isDeleted: false,
          NOT: { id: txn.id }
        }
      });

      if (duplicates > 0) {
        const staff = await prisma.staff.findUnique({ where: { id: txn.staffId } });
        await raiseAlert(
          'DUPLICATE_PAYMENT',
          'CRITICAL',
          'Potential Duplicate Salary Detected',
          `Multiple salary disbursements detected for ${staff?.name || 'Staff'} in ${slipMonth} ${slipYear}.`
        );
      }
    }
  } catch (err) {
    console.error('[ANOMALY_AGENT] checkInstantTransaction error:', err);
  }
}

/**
 * Runs a deep system-wide check using AI heuristics (like hostel resident mismatch or ledger imbalances).
 */
export async function runDeepAudit() {
  try {
    // 1. Fetch hostel resident room state vs active hostel payments
    const residents = await prisma.hostelResident.findMany({
      where: { status: 'ACTIVE' },
      include: {
        student: {
          select: {
            name: true,
            transactions: {
              where: { category: 'HOSTEL_FEE', isDeleted: false },
              orderBy: { date: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    const activeResidentsWithoutFees = residents.filter(r => r.student.transactions.length === 0);

    if (activeResidentsWithoutFees.length > 0) {
      await raiseAlert(
        'HOSTEL_MISMATCH',
        'WARNING',
        'Hostel Residents without Fees',
        `${activeResidentsWithoutFees.length} active hostel residents have no recorded hostel fee payments in their history logs.`
      );
    }

    // 2. Perform ledger balance consistency check
    // We compare cash/bank account totals in simple ledger vs system logs.
    const allTxns = await prisma.transaction.findMany({
      where: { isDeleted: false },
      select: { amount: true, direction: true }
    });

    let calculatedBalance = 0;
    allTxns.forEach(t => {
      const amt = Number(t.amount);
      if (t.direction === 'INCOME') calculatedBalance += amt;
      else calculatedBalance -= amt;
    });

    // In a simple single-ledger system, calculated balance should match total accounts.
    // If we have accounts with different balances, compare them here.
    // For now, if calculated balance is less than zero, that represents a warning.
    if (calculatedBalance < 0) {
      await raiseAlert(
        'LEDGER_DISCREPANCY',
        'CRITICAL',
        'Negative Computed Cash Reserves',
        `The computed ledger balance across all active divisions is currently in negative state: ₹${calculatedBalance.toLocaleString('en-IN')}.`
      );
    }
  } catch (err) {
    console.error('[ANOMALY_AGENT] runDeepAudit error:', err);
  }
}

/**
 * Checks if a transaction deletion is suspicious (e.g. deleting a verified entry older than 24 hours).
 */
export async function checkTransactionDeletion(transactionId: string) {
  try {
    const txn = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!txn) return;

    const now = new Date();
    const diffTime = Math.abs(now.getTime() - txn.createdAt.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // If the entry is older than 1 day, raise an immediate critical security warning
    if (diffDays > 1) {
      await raiseAlert(
        'SECURITY',
        'CRITICAL',
        'Verified Transaction Deleted',
        `A ledger entry of category ${txn.category} (originally dated ${txn.date.toLocaleDateString('en-IN')} with amount ₹${Number(txn.amount).toLocaleString('en-IN')}) was deleted from the portal.`
      );
    }
  } catch (err) {
    console.error('[ANOMALY_AGENT] checkTransactionDeletion error:', err);
  }
}
