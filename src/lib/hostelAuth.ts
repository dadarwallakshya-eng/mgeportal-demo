/**
 * @module lib/hostelAuth
 * @description Shared auth guard for hostel routes — access requires the 'hostel' unit.
 */

import { NextRequest } from 'next/server';

export interface HostelAuth {
  userId: string;
  accessUnits: string[];
}

/** Returns auth context if the user can manage the hostel, else null. */
export function hostelGuard(request: NextRequest): HostelAuth | null {
  const userId = request.headers.get('x-user-id');
  const accessUnitsRaw = request.headers.get('x-user-access-units');
  if (!userId || !accessUnitsRaw) return null;
  const accessUnits = JSON.parse(accessUnitsRaw) as string[];
  if (!accessUnits.includes('hostel')) return null;
  return { userId, accessUnits };
}
