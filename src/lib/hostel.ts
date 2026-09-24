/**
 * @module lib/hostel
 * @description Hostel money helpers — net fee after discount, and a resident's running account.
 *
 * A resident's account (what the institute wants from him):
 *   netFee        = annual hostel fee − discount (capped at 0)
 *   dailyUseGiven = Σ DAILY_USE expenses linked to the student (advances he owes back)
 *   totalCharged  = netFee + dailyUseGiven
 *   paid          = Σ HOSTEL_FEE income from the student
 *   balanceDue    = totalCharged − paid
 */

import prisma from './prisma';
import { DiscountType } from '@prisma/client';

/** Net hostel fee after applying a discount (percentage or fixed). Never below 0. */
export function computeNetFee(annualFee: number, discountType: DiscountType | null, discountValue: number): number {
  if (!discountType || !discountValue) return annualFee;
  let net = annualFee;
  if (discountType === 'PERCENTAGE') {
    net = annualFee * (1 - Math.min(100, discountValue) / 100);
  } else {
    net = annualFee - discountValue;
  }
  return Math.max(0, Math.round(net * 100) / 100);
}

export interface ResidentAccount {
  netFee: number;
  previousOutstanding: number;
  dailyUseGiven: number;
  totalCharged: number;
  paid: number;
  balanceDue: number;
  remainingPreviousOutstanding: number;
  remainingNetFee: number;
}

/** Compute a resident's live account from their fee/discount + previous outstanding + transactions. */
export async function getResidentAccount(
  studentId: string,
  annualFee: number,
  discountType: DiscountType | null,
  discountValue: number,
  previousOutstanding: number = 0
): Promise<ResidentAccount> {
  const netFee = computeNetFee(annualFee, discountType, discountValue);

  const [payments, dailyAgg] = await Promise.all([
    prisma.transaction.findMany({
      where: { studentId, direction: 'INCOME', category: 'HOSTEL_FEE', isDeleted: false },
      select: { amount: true, description: true },
    }),
    prisma.transaction.aggregate({
      where: { studentId, direction: 'EXPENSE', category: 'DAILY_USE', isDeleted: false },
      _sum: { amount: true },
    }),
  ]);

  let paid = 0;
  let paidPreviousDirect = 0;
  let paidCurrentDirect = 0;
  let paidGeneral = 0;

  for (const p of payments) {
    const amt = Number(p.amount || 0);
    paid += amt;
    const desc = p.description || '';
    if (desc.includes('Previous Outstanding Dues')) {
      paidPreviousDirect += amt;
    } else if (desc.includes('Current Year Hostel Fee')) {
      paidCurrentDirect += amt;
    } else {
      paidGeneral += amt;
    }
  }

  const dailyUseGiven = Number(dailyAgg._sum.amount || 0);
  const totalCharged = netFee + previousOutstanding + dailyUseGiven;

  // Live remaining dues calculation
  let remainingPreviousOutstanding = Math.max(0, previousOutstanding - paidPreviousDirect);
  let remainingNetFee = Math.max(0, netFee - paidCurrentDirect);

  if (paidGeneral > 0) {
    const toPrevious = Math.min(remainingPreviousOutstanding, paidGeneral);
    remainingPreviousOutstanding -= toPrevious;
    const remainingGeneral = paidGeneral - toPrevious;

    const toCurrent = Math.min(remainingNetFee, remainingGeneral);
    remainingNetFee -= toCurrent;
  }

  return {
    netFee,
    previousOutstanding,
    dailyUseGiven,
    totalCharged,
    paid,
    balanceDue: Math.round((totalCharged - paid) * 100) / 100,
    remainingPreviousOutstanding: Math.round(remainingPreviousOutstanding * 100) / 100,
    remainingNetFee: Math.round(remainingNetFee * 100) / 100,
  };
}

/** Terminate active hostel allocations for a student (school graduation or withdrawal). */
export async function terminateHostelResidency(studentId: string, checkoutDate: Date = new Date()) {
  const resident = await prisma.hostelResident.findFirst({
    where: { studentId, status: 'ACTIVE' },
  });
  if (!resident) return;

  if (resident.roomId) {
    await prisma.hostelRoom.update({
      where: { id: resident.roomId },
      data: { occupiedCount: { decrement: 1 } },
    });
  }

  await prisma.hostelResident.update({
    where: { id: resident.id },
    data: {
      status: 'TERMINATED',
      checkOutDate: checkoutDate,
      roomId: null,
    },
  });

  await prisma.hostelAllocation.updateMany({
    where: { studentId, status: 'ACTIVE' },
    data: {
      status: 'TERMINATED',
      checkOutDate: checkoutDate,
    },
  });
}
