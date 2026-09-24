/**
 * @module validations
 * @description Zod schemas for input validation across the MGE Portal.
 *
 * SECURITY DECISIONS:
 * - All user input MUST be validated through these schemas before use.
 * - String lengths are constrained to prevent oversized payloads and DB truncation issues.
 * - Enums are used for fixed-choice fields to reject unexpected values.
 * - The journal entry schema includes a superRefine that enforces the fundamental
 *   accounting invariant: total debits must equal total credits (double-entry).
 * - Email and phone use regex patterns that are intentionally permissive — over-strict
 *   regex rejects valid inputs and provides a false sense of security.
 */

import { z } from 'zod';

// ─── Authentication ──────────────────────────────────────────────────────────

/**
 * Login request body validation.
 * Constraints are generous to avoid revealing valid username formats.
 */
export const loginSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must not exceed 50 characters')
    .trim(),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password must not exceed 100 characters'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─── Students ────────────────────────────────────────────────────────────────

/** Gender enum for student records. */
const genderEnum = z.enum(['MALE', 'FEMALE', 'OTHER']);

/** Blood group validation. */
const bloodGroupEnum = z.enum([
  'A_POSITIVE', 'A_NEGATIVE',
  'B_POSITIVE', 'B_NEGATIVE',
  'AB_POSITIVE', 'AB_NEGATIVE',
  'O_POSITIVE', 'O_NEGATIVE',
]).optional();

/**
 * Student creation/update validation.
 * Covers demographic, contact, and enrollment data.
 */
export const studentSchema = z.object({
  // ── Identity ──
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(100, 'First name must not exceed 100 characters')
    .trim(),
  lastName: z
    .string()
    .max(100, 'Last name must not exceed 100 characters')
    .trim()
    .optional()
    .or(z.literal('')),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format'),
  gender: genderEnum,
  bloodGroup: bloodGroupEnum.optional().nullable(),
  religion: z.preprocess((v) => (v === null ? '' : v), z.string().max(50).trim().optional().nullable()),
  nationality: z.preprocess((v) => (v === null ? '' : v), z.string().max(50).trim().optional().nullable()),
  aadharNo: z
    .preprocess(
      (v) => (v === null || v === undefined ? '' : String(v)),
      z.string().trim().refine(val => !val || /^\d{12}$/.test(val.replace(/\s|-/g, '')), {
        message: 'Aadhar number must be exactly 12 digits',
      })
    )
    .optional()
    .nullable(),

  // ── Contact ──
  email: z
    .preprocess((v) => (v === null || v === '' ? undefined : v), z.string().email('Invalid email address').max(255).trim().optional().nullable()),
  phone: z
    .preprocess(
      (v) => (v === null || v === undefined ? '' : String(v)),
      z.string().trim().refine(val => !val || /^\d{10}$/.test(val.replace(/\s|-/g, '')), {
        message: 'Phone number must be exactly 10 digits',
      })
    )
    .optional()
    .nullable(),
  address: z.preprocess((v) => (v === null ? '' : v), z.string().max(500).trim().optional().nullable()),
  city: z.preprocess((v) => (v === null ? '' : v), z.string().max(100).trim().optional().nullable()),
  state: z.preprocess((v) => (v === null ? '' : v), z.string().max(100).trim().optional().nullable()),
  pinCode: z.preprocess((v) => (v === null ? '' : v), z.string().max(10).trim().optional().nullable()),

  // ── Enrollment ──
  // NOTE: Admission ID is auto-generated server-side from the unit's prefix +
  // session year + atomic counter (see src/lib/admission.ts). Clients cannot
  // and should not provide it.
  admissionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Admission date must be in YYYY-MM-DD format'),
  classId: z.string().min(1, 'Class is required'),
  sectionId: z.string().default('-'),
  academicYearId: z.string().trim().optional(),
  srNo: z.string().trim().max(100, 'Sr. Number must not exceed 100 characters').optional(),

  // ── Documents & Dues (R2 Storage / Ledger) ──
  photoUrl: z
    .string()
    .trim()
    .or(z.literal(''))
    .optional(),
  aadharDocUrl: z
    .string()
    .trim()
    .or(z.literal(''))
    .optional(),
  parentAadharDocUrl: z
    .string()
    .trim()
    .or(z.literal(''))
    .optional(),
  previousDues: z
    .preprocess(
      (val) => (val === '' || val === null || val === undefined) ? 0 : Number(val),
      z.number().min(0, 'Previous dues must be a non-negative number')
    )
    .optional(),
  isFromSchool: z.boolean().optional(),
  tuitionDiscountPercent: z
    .preprocess(
      (val) => (val === '' || val === null || val === undefined) ? 0 : Number(val),
      z.number().min(0, 'Tuition discount must be non-negative').max(100, 'Tuition discount cannot exceed 100%')
    )
    .optional(),
  transportDiscountPercent: z
    .preprocess(
      (val) => (val === '' || val === null || val === undefined) ? 0 : Number(val),
      z.number().min(0, 'Transport discount must be non-negative').max(100, 'Transport discount cannot exceed 100%')
    )
    .optional(),

  // ── Guardian ──
  fatherName: z.string().max(100).trim().optional(),
  motherName: z.string().max(100).trim().optional(),
  guardianName: z.string().max(100).trim().optional(),
  guardianPhone: z
    .string()
    .trim()
    .refine(val => !val || /^\d{10}$/.test(val.replace(/\s|-/g, '')), {
      message: 'Parent phone number must be exactly 10 digits',
    })
    .optional(),
  guardianEmail: z
    .string()
    .email('Invalid guardian email')
    .max(255)
    .trim()
    .optional(),
  guardianRelation: z.string().max(50).trim().optional(),

  // ── Medical / Notes ──
  medicalConditions: z.string().max(1000).trim().optional(),
  notes: z.string().max(2000).trim().optional(),
});

export type StudentInput = z.infer<typeof studentSchema>;

// ─── Staff ───────────────────────────────────────────────────────────────────

/** Staff role enum. */
const staffRoleEnum = z.enum([
  'TEACHER',
  'ADMIN',
  'ACCOUNTANT',
  'PRINCIPAL',
  'LIBRARIAN',
  'SUPPORT',
  'OTHER',
]);

/** Employment type. */
const employmentTypeEnum = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY']);

/**
 * Staff creation/update validation.
 */
export const staffSchema = z.object({
  // ── Identity ──
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(100)
    .trim(),
  lastName: z
    .string()
    .max(100)
    .trim()
    .optional()
    .or(z.literal('')),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
    .optional(),
  gender: genderEnum,

  // ── Contact ──
  email: z
    .string()
    .email('Invalid email address')
    .max(255)
    .trim(),
  phone: z
    .string()
    .trim()
    .refine(val => !val || /^\d{10}$/.test(val.replace(/\s|-/g, '')), {
      message: 'Phone number must be exactly 10 digits',
    }),
  address: z.string().max(500).trim().optional(),

  // ── Employment ──
  employeeId: z
    .string()
    .min(1, 'Employee ID is required')
    .max(50)
    .trim(),
  role: staffRoleEnum,
  employmentType: employmentTypeEnum,
  department: z.string().max(100).trim().optional(),
  designation: z.string().max(100).trim().optional(),
  joiningDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Joining date must be in YYYY-MM-DD format'),
  salary: z
    .number()
    .positive('Salary must be positive')
    .max(99999999.99, 'Salary exceeds maximum')
    .optional(),

  // ── Qualifications ──
  qualifications: z.string().max(500).trim().optional(),
  experience: z
    .number()
    .int()
    .min(0)
    .max(60, 'Experience years seems unrealistic')
    .optional(),

  // ── Access ──
  /** Organisational unit IDs this staff member can access. */
  accessUnits: z.array(z.string()).optional(),
});

export type StaffInput = z.infer<typeof staffSchema>;

// ─── Fee Payments ────────────────────────────────────────────────────────────

/** Payment mode enum. */
const paymentModeEnum = z.enum(['CASH', 'CHEQUE', 'ONLINE', 'UPI', 'BANK_TRANSFER', 'DD']);

/**
 * Fee payment recording validation.
 */
export const feePaymentSchema = z.object({
  studentId: z.string().min(1, 'Student ID is required'),
  feeStructureId: z.string().min(1, 'Fee structure ID is required'),
  amount: z
    .number()
    .positive('Amount must be positive')
    .max(9999999.99, 'Amount exceeds maximum'),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Payment date must be in YYYY-MM-DD format'),
  paymentMode: paymentModeEnum,
  transactionReference: z
    .string()
    .max(100)
    .trim()
    .optional(),
  receiptNumber: z
    .string()
    .max(50)
    .trim()
    .optional(),
  academicYearId: z.string().min(1, 'Academic year is required'),
  remarks: z.string().max(500).trim().optional(),

  /** Partial payment or discount information. */
  discount: z
    .number()
    .min(0, 'Discount cannot be negative')
    .max(9999999.99, 'Discount exceeds maximum')
    .optional(),
  fine: z
    .number()
    .min(0, 'Fine cannot be negative')
    .max(999999.99, 'Fine exceeds maximum')
    .optional(),
});

export type FeePaymentInput = z.infer<typeof feePaymentSchema>;

// ─── Journal Entries (Double-Entry Accounting) ───────────────────────────────

/**
 * Individual line item in a journal entry.
 * Each line is either a debit or a credit to a specific ledger account.
 */
const journalLineSchema = z.object({
  accountId: z.string().min(1, 'Account ID is required'),
  description: z.string().max(500).trim().optional(),
  debit: z
    .number()
    .min(0, 'Debit amount cannot be negative')
    .default(0),
  credit: z
    .number()
    .min(0, 'Credit amount cannot be negative')
    .default(0),
});

/**
 * Journal entry validation for double-entry bookkeeping.
 *
 * ACCOUNTING INVARIANT:
 * The sum of all debit amounts must exactly equal the sum of all credit amounts.
 * This is enforced via a superRefine validator. A journal entry that violates this
 * invariant is ALWAYS rejected — there are no exceptions.
 *
 * Each line must have either a debit OR a credit (not both, not neither).
 */
export const journalEntrySchema = z
  .object({
    entryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Entry date must be in YYYY-MM-DD format'),
    narration: z
      .string()
      .min(1, 'Narration/description is required')
      .max(1000)
      .trim(),
    referenceNumber: z
      .string()
      .max(50)
      .trim()
      .optional(),
    voucherType: z
      .enum(['RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL'])
      .optional(),
    academicYearId: z.string().min(1, 'Academic year is required'),
    lines: z
      .array(journalLineSchema)
      .min(2, 'A journal entry must have at least 2 line items'),
  })
  .superRefine((data, ctx) => {
    let totalDebits = 0;
    let totalCredits = 0;

    for (let i = 0; i < data.lines.length; i++) {
      const line = data.lines[i];

      // Each line must have exactly one of debit or credit (not both, not zero/zero).
      if (line.debit > 0 && line.credit > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Line ${i + 1}: A line item cannot have both debit and credit amounts`,
          path: ['lines', i],
        });
      }

      if (line.debit === 0 && line.credit === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Line ${i + 1}: A line item must have either a debit or credit amount`,
          path: ['lines', i],
        });
      }

      totalDebits += line.debit;
      totalCredits += line.credit;
    }

    // Floating-point safe comparison: round to 2 decimal places (currency precision).
    const roundedDebits = Math.round(totalDebits * 100) / 100;
    const roundedCredits = Math.round(totalCredits * 100) / 100;

    if (roundedDebits !== roundedCredits) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Total debits (${roundedDebits.toFixed(2)}) must equal total credits (${roundedCredits.toFixed(2)})`,
        path: ['lines'],
      });
    }
  });

export type JournalEntryInput = z.infer<typeof journalEntrySchema>;
