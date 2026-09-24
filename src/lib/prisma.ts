/**
 * @module prisma
 * @description Prisma Client singleton for Next.js (Prisma v7 compatible).
 *
 * WHY A SINGLETON & ADAPTER:
 * Next.js hot-reloads modules in development, which creates a new PrismaClient
 * instance on every reload. Storing the client and connection pool on `globalThis`
 * ensures a single instance persists across hot reloads.
 *
 * In Prisma 7, a driver adapter (e.g. PrismaPg) is required to bridge connection between
 * the query builder client and the database driver (pg).
 *
 * LOGGING:
 * - Development: logs queries, info, warnings, and errors.
 * - Production: logs only errors to avoid performance overhead and sensitive data leakage.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Get database URL from environment variable or fallback for development
const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/postgres';

/**
 * Extend globalThis to hold the Prisma client and Pool singleton across hot reloads.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

// Create or retrieve pg Connection Pool singleton.
// Supabase uses a self-signed certificate chain on its PgBouncer/Supavisor endpoints.
// rejectUnauthorized: false disables cert verification (safe for Supabase's managed infra).
// NODE_TLS_REJECT_UNAUTHORIZED=0 in .env provides the same globally for Prisma's own TLS layer.
const pool = globalForPrisma.pgPool ?? new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }, // allow Supabase self-signed certificates in both dev and prod
  max: IS_PRODUCTION ? 10 : 5, // Allow enough concurrent query slots while avoiding connection queuing
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 5000, // Fast connection timeout of 5 seconds to prevent hanging
});

if (!IS_PRODUCTION) {
  globalForPrisma.pgPool = pool;
}

// Instantiate driver adapter
const adapter = new PrismaPg(pool);

import { encrypt, decrypt } from './encryption';

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: IS_PRODUCTION
      ? ['error']
      : ['query', 'info', 'warn', 'error'],
  });

// Persist client singleton
if (!IS_PRODUCTION) {
  globalForPrisma.prisma = basePrisma;
}

export const prisma = basePrisma.$extends({
  result: {
    student: {
      aadharNo: {
        needs: { aadharNo: true },
        compute(student) {
          return decrypt(student.aadharNo);
        },
      },
    },
    staff: {
      aadharNo: {
        needs: { aadharNo: true },
        compute(staff) {
          return decrypt(staff.aadharNo);
        },
      },
      panNo: {
        needs: { panNo: true },
        compute(staff) {
          return decrypt(staff.panNo);
        },
      },
      bankAccountNo: {
        needs: { bankAccountNo: true },
        compute(staff) {
          return decrypt(staff.bankAccountNo);
        },
      },
    },
  },
  query: {
    student: {
      async create({ args, query }) {
        if (args.data.aadharNo) {
          args.data.aadharNo = encrypt(args.data.aadharNo);
        }
        return query(args);
      },
      async update({ args, query }) {
        if (args.data.aadharNo) {
          if (typeof args.data.aadharNo === 'string') {
            args.data.aadharNo = encrypt(args.data.aadharNo);
          } else if (args.data.aadharNo.set) {
            args.data.aadharNo.set = encrypt(args.data.aadharNo.set);
          }
        }
        return query(args);
      },
      async upsert({ args, query }) {
        if (args.create.aadharNo) {
          args.create.aadharNo = encrypt(args.create.aadharNo);
        }
        if (args.update.aadharNo) {
          if (typeof args.update.aadharNo === 'string') {
            args.update.aadharNo = encrypt(args.update.aadharNo);
          } else if (args.update.aadharNo.set) {
            args.update.aadharNo.set = encrypt(args.update.aadharNo.set);
          }
        }
        return query(args);
      },
    },
    staff: {
      async create({ args, query }) {
        if (args.data.aadharNo) args.data.aadharNo = encrypt(args.data.aadharNo);
        if (args.data.panNo) args.data.panNo = encrypt(args.data.panNo);
        if (args.data.bankAccountNo) args.data.bankAccountNo = encrypt(args.data.bankAccountNo);
        return query(args);
      },
      async update({ args, query }) {
        if (args.data.aadharNo) {
          if (typeof args.data.aadharNo === 'string') args.data.aadharNo = encrypt(args.data.aadharNo);
          else if (args.data.aadharNo.set) args.data.aadharNo.set = encrypt(args.data.aadharNo.set);
        }
        if (args.data.panNo) {
          if (typeof args.data.panNo === 'string') args.data.panNo = encrypt(args.data.panNo);
          else if (args.data.panNo.set) args.data.panNo.set = encrypt(args.data.panNo.set);
        }
        if (args.data.bankAccountNo) {
          if (typeof args.data.bankAccountNo === 'string') args.data.bankAccountNo = encrypt(args.data.bankAccountNo);
          else if (args.data.bankAccountNo.set) args.data.bankAccountNo.set = encrypt(args.data.bankAccountNo.set);
        }
        return query(args);
      },
      async upsert({ args, query }) {
        if (args.create.aadharNo) args.create.aadharNo = encrypt(args.create.aadharNo);
        if (args.create.panNo) args.create.panNo = encrypt(args.create.panNo);
        if (args.create.bankAccountNo) args.create.bankAccountNo = encrypt(args.create.bankAccountNo);
        if (args.update.aadharNo) {
          if (typeof args.update.aadharNo === 'string') args.update.aadharNo = encrypt(args.update.aadharNo);
          else if (args.update.aadharNo.set) args.update.aadharNo.set = encrypt(args.update.aadharNo.set);
        }
        if (args.update.panNo) {
          if (typeof args.update.panNo === 'string') args.update.panNo = encrypt(args.update.panNo);
          else if (args.update.panNo.set) args.update.panNo.set = encrypt(args.update.panNo.set);
        }
        if (args.update.bankAccountNo) {
          if (typeof args.update.bankAccountNo === 'string') args.update.bankAccountNo = encrypt(args.update.bankAccountNo);
          else if (args.update.bankAccountNo.set) args.update.bankAccountNo.set = encrypt(args.update.bankAccountNo.set);
        }
        return query(args);
      },
    },
  },
});

// Self-healing database migration helper.
//
// SECURITY/OPS: this runs DDL (ALTER/CREATE) on startup. Running it on every
// production cold start means (a) repeated catalog churn + lock contention and
// (b) the app's DB role must hold schema-modification rights (not least-privilege).
// The production database already has all these columns, so we now SKIP this in
// production and only auto-heal in local development. Schema changes for prod
// should go through a deliberate migration step (e.g. `prisma migrate deploy`).
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'production' && !process.env.DISABLE_SELF_HEAL) {
  (async () => {
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE staff ADD COLUMN IF NOT EXISTS "experience_years" INTEGER;
        ALTER TABLE staff ADD COLUMN IF NOT EXISTS "qualifications" VARCHAR(500);
        ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "receipt_url" TEXT;
        ALTER TABLE staff ADD COLUMN IF NOT EXISTS "staff_no" VARCHAR(100);
        ALTER TABLE users DROP COLUMN IF EXISTS "password_plain";
        ALTER TABLE students ADD COLUMN IF NOT EXISTS "is_from_school" BOOLEAN DEFAULT FALSE;
        ALTER TABLE students ADD COLUMN IF NOT EXISTS "sr_no" VARCHAR(100);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "phone" VARCHAR(50);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "photo_url" TEXT;
      `);

      try {
        await prisma.$executeRawUnsafe(`
          CREATE UNIQUE INDEX IF NOT EXISTS staff_staff_no_key ON staff(staff_no);
        `);
      } catch (idxErr) {
        // Safe to ignore if already exists
      }

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS staff_counters (
          staff_type VARCHAR(50) NOT NULL,
          year INTEGER NOT NULL,
          next_no INTEGER NOT NULL DEFAULT 1,
          PRIMARY KEY (staff_type, year)
        );
      `);
      console.log("[PRISMA] Database columns and tables verified/added.");

      // Backfill existing staff who do not have a staffNo
      const unassigned = await prisma.staff.findMany({
        where: { staffNo: null },
        orderBy: { joiningDate: 'asc' },
      });

      if (unassigned.length > 0) {
        console.log(`[PRISMA] Found ${unassigned.length} staff records needing a staffNo. Backfilling...`);
        for (const s of unassigned) {
          const prefix = s.staffType === 'TEACHER' ? 'TEA' : s.staffType === 'DRIVER' ? 'DRI' : 'STF';
          
          const joinDate = new Date(s.joiningDate);
          const y = joinDate.getUTCFullYear();
          const year = joinDate.getUTCMonth() >= 3 ? y : y - 1;

          const rows = await prisma.$queryRaw<{ next_no: number }[]>`
            INSERT INTO staff_counters (staff_type, year, next_no)
            VALUES (${s.staffType}, ${year}, 1)
            ON CONFLICT (staff_type, year)
            DO UPDATE SET next_no = staff_counters.next_no + 1
            RETURNING next_no
          `;

          const allocated = rows[0]?.next_no;
          if (allocated) {
            const staffNo = `${prefix}${year}-${String(allocated).padStart(5, '0')}`;
            await prisma.staff.update({
              where: { id: s.id },
              data: { staffNo },
            });
            console.log(`[PRISMA] Backfilled Staff '${s.name}' with ID: ${staffNo}`);
          }
        }
        console.log("[PRISMA] Staff backfill completed successfully.");
      }
    } catch (err) {
      console.error("[PRISMA] Database migration/backfill failed or database is unreachable:", err);
    }
  })();
}

export default prisma;
