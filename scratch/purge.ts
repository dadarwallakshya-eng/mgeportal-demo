import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.production.local') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function run() {
  try {
    const result = await prisma.systemSetting.deleteMany({
      where: { key: { in: ['callmebot_phone', 'callmebot_apikey'] } }
    });
    console.log('Successfully deleted callmebot keys. Count:', result.count);
  } catch (e) {
    console.error('Error during deletion:', e);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

run();
