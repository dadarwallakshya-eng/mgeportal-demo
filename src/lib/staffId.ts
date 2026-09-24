import { prisma } from "@/lib/prisma";
import { StaffType } from "@prisma/client";

/** April-1 boundary for academic session calculation. */
export function getSessionYear(date: Date): number {
  const y = date.getUTCFullYear();
  // 0-indexed month: 3 = April. Pre-April belongs to previous session.
  return date.getUTCMonth() >= 3 ? y : y - 1;
}

/** Pads numbers to 5 digits. */
export function padFiveDigits(n: number): string {
  return n.toString().padStart(5, "0");
}

/**
 * Generates a unique Staff ID atomically using staff_counters.
 */
export async function generateStaffNo(
  staffType: StaffType,
  joiningDate: Date
): Promise<string> {
  const prefix = staffType === 'TEACHER' ? 'TEA' : staffType === 'DRIVER' ? 'DRI' : 'STF';
  const year = getSessionYear(joiningDate);

  // Increment counter atomically
  const rows = await prisma.$queryRaw<{ next_no: number }[]>`
    INSERT INTO staff_counters (staff_type, year, next_no)
    VALUES (${staffType}, ${year}, 1)
    ON CONFLICT (staff_type, year)
    DO UPDATE SET next_no = staff_counters.next_no + 1
    RETURNING next_no
  `;

  const allocated = rows[0]?.next_no;
  if (!allocated || allocated < 1) {
    throw new Error(`Failed to allocate staff number for type ${staffType}, year ${year}.`);
  }

  return `${prefix}${year}-${padFiveDigits(allocated)}`;
}
