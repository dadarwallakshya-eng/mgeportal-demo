/**
 * @module lib/transport
 * @description Shared logic for keeping a student's transport assignment and the matching
 *              "Transport Fee" allocation in sync.
 *
 * RULES:
 * - OWN_VEHICLE  → transport fee is ₹0. Any unpaid Transport Fee allocation is removed;
 *                  if some amount was already paid, the allocation is capped to what was paid.
 * - BUS_SERVICE  → annual fee = the selected station's `perYear`. The Transport Fee allocation
 *                  is created or updated to that amount (preserving any amount already paid).
 *
 * This keeps tuition and bus fare as SEPARATE line items in the student's fee ledger,
 * so the Fees Engine can collect them independently.
 */

import prisma from './prisma';
import { TransportMode, FeeStatus } from '@prisma/client';

const TRANSPORT_COMPONENT_NAME = 'Transport Fee';

/** Academic year string e.g. 2026-27 from a date (April = start of year). */
function getAcademicYear(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  if (month >= 3) return `${year}-${String(year + 1).slice(-2)}`;
  return `${year - 1}-${String(year).slice(-2)}`;
}

/** Find or create the shared "Transport Fee" component for a unit/class/year. */
async function ensureTransportComponent(unitId: string, className: string, academicYear: string) {
  let structure = await prisma.feeStructure.findFirst({
    where: { unitId, className, academicYear },
  });
  if (!structure) {
    structure = await prisma.feeStructure.create({
      data: {
        name: `Fee Structure — Class ${className} (${academicYear})`,
        unitId, className, academicYear,
      },
    });
  }
  let component = await prisma.feeComponent.findFirst({
    where: { feeStructureId: structure.id, name: TRANSPORT_COMPONENT_NAME },
  });
  if (!component) {
    component = await prisma.feeComponent.create({
      data: { feeStructureId: structure.id, name: TRANSPORT_COMPONENT_NAME, amount: 0 },
    });
  }
  return component;
}

/** Locate a student's existing Transport Fee allocation (if any). */
async function findTransportAllocation(studentId: string) {
  return prisma.feeAllocation.findFirst({
    where: { studentId, feeComponent: { name: TRANSPORT_COMPONENT_NAME } },
    include: { feeComponent: true },
  });
}

export interface TransportInput {
  studentId: string;
  unitId: string;
  className: string;
  admissionDate: Date;
  transportMode: TransportMode;
  busStationId?: string | null;
}

export interface TransportResult {
  transportMode: TransportMode;
  busStationId: string | null;
  annualFee: number;
  stationName: string | null;
}

/**
 * Apply a transport choice to a student: updates the student record AND
 * synchronises the Transport Fee allocation. Returns a summary.
 *
 * Note: uses sequential awaits (PgBouncer transaction mode forbids prisma.$transaction).
 */
export async function applyStudentTransport(input: TransportInput): Promise<TransportResult> {
  const { studentId, unitId, className, admissionDate, transportMode } = input;
  const academicYear = getAcademicYear(admissionDate);

  // ── OWN_VEHICLE: no bus fare ──────────────────────────────────────────────
  if (transportMode === 'OWN_VEHICLE' || !input.busStationId) {
    await prisma.student.update({
      where: { id: studentId },
      data: { transportMode: TransportMode.OWN_VEHICLE, busStationId: null },
    });

    const existing = await findTransportAllocation(studentId);
    if (existing) {
      const paid = Number(existing.amountPaid);
      if (paid <= 0) {
        // No money applied yet → remove the allocation entirely
        await prisma.feeAllocation.delete({ where: { id: existing.id } });
      } else {
        // Some money already collected → cap due to what was paid, mark settled
        await prisma.feeAllocation.update({
          where: { id: existing.id },
          data: { amountDue: paid, status: FeeStatus.PAID },
        });
      }
    }
    return { transportMode: TransportMode.OWN_VEHICLE, busStationId: null, annualFee: 0, stationName: null };
  }

  // ── BUS_SERVICE: annual fee from the chosen station ───────────────────────
  const station = await prisma.busStation.findUnique({ where: { id: input.busStationId } });
  if (!station) {
    throw new Error('Selected bus station not found.');
  }
  const annualFee = Number(station.perYear);

  await prisma.student.update({
    where: { id: studentId },
    data: { transportMode: TransportMode.BUS_SERVICE, busStationId: station.id },
  });

  const component = await ensureTransportComponent(unitId, className, academicYear);
  const existing = await findTransportAllocation(studentId);

  if (existing) {
    const paid = Number(existing.amountPaid);
    const status: FeeStatus =
      paid >= annualFee ? FeeStatus.PAID : paid > 0 ? FeeStatus.PARTIALLY_PAID : FeeStatus.UNPAID;
    await prisma.feeAllocation.update({
      where: { id: existing.id },
      data: { amountDue: annualFee, status },
    });
  } else {
    await prisma.feeAllocation.create({
      data: {
        studentId,
        feeComponentId: component.id,
        amountDue: annualFee,
        amountPaid: 0,
        dueDate: admissionDate,
        status: FeeStatus.UNPAID,
      },
    });
  }

  return { transportMode: TransportMode.BUS_SERVICE, busStationId: station.id, annualFee, stationName: station.name };
}
