/**
 * @file src/app/api/transactions/[id]/route.ts
 * @description Secure endpoint to edit, delete (soft-delete), or restore (revoke delete) a transaction.
 *              Requires password re-authentication, logs edits to transaction_edit_logs,
 *              audits via logAuditEvent, and generates database/SSE notifications.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { notificationEmitter } from '@/lib/notifications';
import { isCategoryAllowed } from '@/lib/finance';
import { TxnCategory, TxnDirection } from '@prisma/client';
import { z } from 'zod';
import { checkTransactionDeletion } from '@/lib/anomalyAgent';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const editSchema = z.object({
  action: z.enum(['edit', 'delete', 'restore']).optional().default('edit'),
  amount: z.number().positive('Amount must be positive').optional(),
  category: z.enum(['FEE', 'HOSTEL_FEE', 'OTHER_INCOME', 'SALARY', 'HOSTEL_SALARY', 'MESS', 'LAUNDRY', 'DAILY_USE', 'TRANSPORT', 'OTHER_EXPENSE']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  description: z.string().max(500).trim().optional(),
  reasonCategory: z.string().trim().min(1, 'Reason category is required'),
  detailExplanation: z.string().trim().optional(),
  confirmPassword: z.string().min(1, 'Password is required to confirm change'),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid transaction ID', code: 'INVALID_ID' }, { status: 400 });
    }

    // 1. Authenticate user from middleware headers
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role') || '';
    const userName = request.headers.get('x-user-name') || 'user';
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);

    // Only DIRECTOR, ACCOUNTANT and PRINCIPAL roles can modify ledger logs
    if (userRole !== 'DIRECTOR' && userRole !== 'ACCOUNTANT' && userRole !== 'PRINCIPAL') {
      return NextResponse.json(
        { error: 'Only accountants, directors, and principals are authorized to modify transactions.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // 2. Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, { status: 400 });
    }

    const validation = editSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      }, { status: 400 });
    }

    const d = validation.data;

    // Validate edit-specific parameters
    if (d.action === 'edit') {
      if (d.amount === undefined || !d.category || !d.date) {
        return NextResponse.json({
          error: 'Amount, category, and date are required to edit a transaction.',
          code: 'VALIDATION_ERROR',
        }, { status: 400 });
      }
    }

    // If reason is "Other", detail explanation is strictly mandatory
    if (d.reasonCategory.startsWith('Other') && (!d.detailExplanation || d.detailExplanation.length < 10)) {
      return NextResponse.json({
        error: 'Detailed explanation of at least 10 characters is required when choosing "Other" reason.',
        code: 'VALIDATION_ERROR',
      }, { status: 400 });
    }

    const finalReason = d.reasonCategory.startsWith('Other')
      ? `Other: ${d.detailExplanation}`
      : `${d.reasonCategory}${d.detailExplanation ? ` (${d.detailExplanation})` : ''}`;

    // 3. Fetch current transaction details
    const txn = await prisma.transaction.findUnique({
      where: { id },
    });

    if (!txn) {
      return NextResponse.json({ error: 'Transaction not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    // Verify division access
    if (txn.unitId && !accessUnits.includes(txn.unitId)) {
      return NextResponse.json({ error: 'Access denied for this division', code: 'FORBIDDEN' }, { status: 403 });
    }

    // Category scoping checks for edits
    if (d.action === 'edit' && d.category) {
      if (!isCategoryAllowed(txn.unitId, txn.direction, d.category as TxnCategory)) {
        return NextResponse.json({
          error: `Category ${d.category} is not permitted for the selected division.`,
          code: 'VALIDATION_ERROR',
        }, { status: 400 });
      }
    }

    // 4. Verify password to re-authenticate session
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user || !(await verifyPassword(d.confirmPassword, user.passwordHash))) {
      return NextResponse.json({ error: 'Incorrect password. Verification failed.', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    let updatedTxn;
    let title = '';
    let message = '';
    let auditType: 'UPDATE' | 'DELETE' = 'UPDATE';

    // 5. Execute action inside transaction block
    if (d.action === 'edit') {
      updatedTxn = await prisma.$transaction(async (tx) => {
        await tx.transactionEditLog.create({
          data: {
            transactionId: id,
            editedBy: userId,
            reason: finalReason,
            prevAmount: txn.amount,
            newAmount: d.amount!,
            prevDetails: txn.description,
            newDetails: d.description || null,
          },
        });

        return tx.transaction.update({
          where: { id },
          data: {
            amount: d.amount!,
            category: d.category as TxnCategory,
            date: new Date(d.date!),
            description: d.description || null,
          },
        });
      });

      title = 'Financial Ledger Record Edited';
      message = `Transaction of amount ₹${txn.amount} changed to ₹${d.amount} by ${userName}. Reason: ${finalReason}`;
      auditType = 'UPDATE';

    } else if (d.action === 'delete') {
      if (txn.isDeleted) {
        return NextResponse.json({ error: 'Transaction is already deleted.', code: 'BAD_REQUEST' }, { status: 400 });
      }

      await checkTransactionDeletion(id);

      updatedTxn = await prisma.transaction.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      title = 'Financial Ledger Record Deleted';
      message = `Transaction of amount ₹${txn.amount} was deleted (soft-deleted) by ${userName}. Reason: ${finalReason}`;
      auditType = 'DELETE';

    } else if (d.action === 'restore') {
      if (!txn.isDeleted) {
        return NextResponse.json({ error: 'Transaction is not deleted.', code: 'BAD_REQUEST' }, { status: 400 });
      }

      updatedTxn = await prisma.transaction.update({
        where: { id },
        data: {
          isDeleted: false,
          deletedAt: null,
        },
      });

      title = 'Financial Ledger Record Restored';
      message = `Transaction of amount ₹${txn.amount} was restored (revoked delete) by ${userName}. Reason: ${finalReason}`;
      auditType = 'UPDATE';
    }

    // 6. Write SIEM audit logs
    await logAuditEvent(userId, auditType, 'Transaction', id, {
      amount: txn.amount.toString(),
      action: d.action,
      reason: finalReason,
    });

    // 7. Write and dispatch Notifications
    const directors = await prisma.user.findMany({
      where: { role: 'DIRECTOR', isActive: true, id: { not: userId } },
      select: { id: true },
    });

    const notificationTargets = [
      ...directors.map(dir => dir.id),
      userId, // Also notify the editor/deleter
    ];

    for (const targetId of notificationTargets) {
      const notification = await prisma.notification.create({
        data: {
          userId: targetId,
          title,
          message,
        },
      });

      // Broadcast to active SSE listeners
      notificationEmitter.emit('notification', {
        userId: targetId,
        notification,
      });
    }

    return NextResponse.json({ ok: true, transaction: updatedTxn });
  } catch (error) {
    console.error('[TRANSACTION_PATCH] Internal error:', error);
    return NextResponse.json({ error: 'An error occurred while modifying the transaction.', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
