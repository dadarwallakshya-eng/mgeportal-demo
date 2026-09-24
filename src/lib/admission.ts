/**
 * @file src/lib/admission.ts
 * @description Atomic generator for student Admission IDs.
 *
 *   Format:  <UNIT_PREFIX><SESSION_YEAR>-<NNNNN>
 *   Examples:
 *     - MES2026-00001  (English Medium, admitted in session 2026-27)
 *     - NMS2026-00001  (Hindi Medium,   admitted in session 2026-27)
 *     - MGC2026-00001  (College,        admitted in session 2026-27)
 *
 *   Each (unitId, year) pair has its own running counter row in
 *   `admission_counters`. We allocate the next number with a single
 *   INSERT … ON CONFLICT DO UPDATE … RETURNING — atomic under PgBouncer
 *   (no client-side transaction needed).
 *
 *   The "year" is the START year of the Indian academic session
 *   (April → March). A child admitted on 5-Apr-2026 → session 2026-27 → year=2026.
 *   A child admitted on 15-Mar-2027 → still session 2026-27 → year=2026.
 *   This way the ID year truly reflects "which intake batch" the student belongs to.
 */

import { prisma } from "@/lib/prisma";

/** April-1 boundary. Pass any admission date; returns the session START year. */
export function getSessionYear(admissionDate: Date): number {
  const y = admissionDate.getUTCFullYear();
  // Months are 0-indexed: 0=Jan … 3=April.
  // Anything before April belongs to the previous session.
  return admissionDate.getUTCMonth() >= 3 ? y : y - 1;
}

/** Pads a positive integer to 5 digits (00001, 00042, 12345). */
export function padFiveDigits(n: number): string {
  return n.toString().padStart(5, "0");
}

/**
 * Allocates and returns the next admission ID for the given unit, based on
 * the given admission date. Atomic: safe under concurrent registrations.
 *
 * Throws if the unit isn't configured for student admission (no prefix).
 */
export async function generateAdmissionNo(
  unitId: string,
  admissionDate: Date
): Promise<string> {
  // 1. Load the unit's prefix. Cheap; could be cached, but registrations are rare.
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { admissionPrefix: true, name: true },
  });

  if (!unit) {
    throw new Error(`Unit '${unitId}' does not exist.`);
  }
  if (!unit.admissionPrefix) {
    throw new Error(
      `Unit '${unit.name}' is not configured for student admission (no admissionPrefix set).`
    );
  }

  const year = getSessionYear(admissionDate);

  // 2. Atomically allocate the next running number for (unit, year).
  //    Returns next_no AFTER the operation, which is the number we use.
  const rows = await prisma.$queryRaw<{ next_no: number }[]>`
    INSERT INTO admission_counters (unit_id, year, next_no)
    VALUES (${unitId}, ${year}, 1)
    ON CONFLICT (unit_id, year)
    DO UPDATE SET next_no = admission_counters.next_no + 1
    RETURNING next_no
  `;

  const allocated = rows[0]?.next_no;
  if (!allocated || allocated < 1) {
    throw new Error(
      `Failed to allocate admission number for unit '${unitId}', year ${year}.`
    );
  }

  // 3. Compose: PREFIX + YEAR + "-" + zero-padded number.
  return `${unit.admissionPrefix}${year}-${padFiveDigits(allocated)}`;
}
