import dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  console.log("Connecting using pure pg Pool...");

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log("Connected! Running migration...");
    
    // Add the sr_no column to students table
    const res = await client.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS "sr_no" VARCHAR(100);');
    console.log("Migration query executed! Result:", res);
    
    // Test selecting students to see if it succeeds
    const studentsRes = await client.query('SELECT id, name, admission_no, sr_no FROM students LIMIT 3;');
    console.log("Test query succeeded! Retrieved students:");
    console.log(JSON.stringify(studentsRes.rows, null, 2));

    client.release();
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await pool.end();
  }
}

main();
