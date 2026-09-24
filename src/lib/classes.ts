/**
 * @module lib/classes
 * @description Canonical class catalog and fee chart (Session 2026-27), sourced from "Fees chart.pdf".
 *
 * This is the single source of truth for:
 *  - Which classes each division (medium) offers — drives the registration class dropdown.
 *  - The tuition fee per class per medium — used to seed FeeStructures and show fees in the form.
 *
 * MEDIUM = DIVISION/UNIT:
 *  - 'hindi'   → Hindi Medium School  (uses the `hindi` fee column)
 *  - 'english' → English Medium School (uses the `english` fee column)
 *  - 'college' → College (B.A. / B.Sc. courses; fees configured later in the Fees Engine)
 *
 * A `null` fee means that class is NOT offered in that medium (shown as "–" in the chart),
 * so it is excluded from that division's class dropdown.
 */

export const FEE_ACADEMIC_YEAR = '2026-27';
export const ADMISSION_FEE = 0;

export interface ClassFeeRow {
  key: string;            // canonical className stored on Student & FeeStructure
  label: string;          // friendly label shown in dropdowns
  hindi: number | null;   // Hindi-medium annual tuition (null = not offered)
  english: number | null; // English-medium annual tuition (null = not offered)
  hostel: number | null;  // annual hostel fee for boarders (used by the Hostel module)
}

/** School classes (Nursery → XII) with per-medium tuition, exactly per the fee chart PDF. */
export const SCHOOL_FEE_CHART: ClassFeeRow[] = [
  { key: 'Nursery',       label: 'Nursery',                   hindi: null,  english: 8500,  hostel: null },
  { key: 'LKG',           label: 'LKG',                       hindi: 8000,  english: 10500, hostel: null },
  { key: 'UKG',           label: 'UKG',                       hindi: 8500,  english: 13500, hostel: null },
  { key: '1',             label: 'Class 1',                   hindi: 11500, english: 15000, hostel: null },
  { key: '2',             label: 'Class 2',                   hindi: 12500, english: 17000, hostel: null },
  { key: '3',             label: 'Class 3',                   hindi: 13500, english: 18000, hostel: 60000 },
  { key: '4',             label: 'Class 4',                   hindi: 14000, english: 19000, hostel: 60000 },
  { key: '5',             label: 'Class 5',                   hindi: 15000, english: 20000, hostel: 60000 },
  { key: '6',             label: 'Class 6',                   hindi: 16000, english: 21000, hostel: 65000 },
  { key: '7',             label: 'Class 7',                   hindi: 17000, english: 22000, hostel: 65000 },
  { key: '8',             label: 'Class 8',                   hindi: 18000, english: 23500, hostel: 65000 },
  { key: '9',             label: 'Class 9',                   hindi: 22500, english: 25000, hostel: 65000 },
  { key: '10',            label: 'Class 10',                  hindi: 26000, english: 26500, hostel: 65000 },
  { key: '11 (Arts)',     label: 'Class 11 (Arts)',           hindi: 26000, english: null,  hostel: 65000 },
  { key: '11 (Science)',  label: 'Class 11 (Science)',        hindi: 36500, english: 38000, hostel: 65000 },
  { key: '11 (Sci. Ag.)', label: 'Class 11 (Science - Agri.)', hindi: 31000, english: null, hostel: 65000 },
  { key: '12 (Arts)',     label: 'Class 12 (Arts)',           hindi: 28000, english: null,  hostel: 65000 },
  { key: '12 (Science)',  label: 'Class 12 (Science)',        hindi: 38500, english: 40000, hostel: 65000 },
  { key: '12 (Sci. Ag.)', label: 'Class 12 (Science - Agri.)', hindi: 35000, english: null, hostel: 65000 },
];

/** College courses (fees configured later via the Fees Engine). */
export const COLLEGE_CLASSES: { key: string; label: string }[] = [
  { key: 'B.A. 1st Year',  label: 'B.A. 1st Year' },
  { key: 'B.A. 2nd Year',  label: 'B.A. 2nd Year' },
  { key: 'B.A. 3rd Year',  label: 'B.A. 3rd Year' },
  { key: 'B.Sc. 1st Year', label: 'B.Sc. 1st Year' },
  { key: 'B.Sc. 2nd Year', label: 'B.Sc. 2nd Year' },
  { key: 'B.Sc. 3rd Year', label: 'B.Sc. 3rd Year' },
];

/** Classes offered for a given division/unit, in display order. */
export function getClassesForUnit(unitId: string): { key: string; label: string }[] {
  if (unitId === 'hindi') {
    return SCHOOL_FEE_CHART.filter((c) => c.hindi !== null).map((c) => ({ key: c.key, label: c.label }));
  }
  if (unitId === 'english') {
    return SCHOOL_FEE_CHART.filter((c) => c.english !== null).map((c) => ({ key: c.key, label: c.label }));
  }
  if (unitId === 'college') {
    return COLLEGE_CLASSES;
  }
  return [];
}

/** Annual tuition for a unit+class. Returns null for college (no chart) or classes not offered. */
export function getTuitionFee(unitId: string, classKey: string): number | null {
  const row = SCHOOL_FEE_CHART.find((c) => c.key === classKey);
  if (!row) return null;
  if (unitId === 'hindi') return row.hindi;
  if (unitId === 'english') return row.english;
  return null;
}

/** Annual hostel fee for a class (medium-independent), or null if not applicable. */
export function getHostelFee(classKey: string): number | null {
  return SCHOOL_FEE_CHART.find((c) => c.key === classKey)?.hostel ?? null;
}

/** Get the next logical class for promotion. Returns 'GRADUATED' for exit classes or null. */
export function getNextClass(classKey: string): string | 'GRADUATED' | null {
  const nextMap: Record<string, string | 'GRADUATED'> = {
    'Nursery': 'LKG',
    'LKG': 'UKG',
    'UKG': '1',
    '1': '2',
    '2': '3',
    '3': '4',
    '4': '5',
    '5': '6',
    '6': '7',
    '7': '8',
    '8': '9',
    '9': '10',
    // Class 10 has split streams (Arts/Science/Agri) so no auto-next class
    '11 (Arts)': '12 (Arts)',
    '11 (Science)': '12 (Science)',
    '11 (Sci. Ag.)': '12 (Sci. Ag.)',
    '12 (Arts)': 'GRADUATED',
    '12 (Science)': 'GRADUATED',
    '12 (Sci. Ag.)': 'GRADUATED',
    // College
    'B.A. 1st Year': 'B.A. 2nd Year',
    'B.A. 2nd Year': 'B.A. 3rd Year',
    'B.A. 3rd Year': 'GRADUATED',
    'B.Sc. 1st Year': 'B.Sc. 2nd Year',
    'B.Sc. 2nd Year': 'B.Sc. 3rd Year',
    'B.Sc. 3rd Year': 'GRADUATED',
  };
  return nextMap[classKey] || null;
}

/** Get the Class 11 stream classes offered in a given division/unit. */
export function getClass11Streams(unitId: string): { key: string; label: string }[] {
  return SCHOOL_FEE_CHART
    .filter(c => c.key.startsWith('11') && (unitId === 'hindi' ? c.hindi : c.english) !== null)
    .map(c => ({ key: c.key, label: c.label }));
}
