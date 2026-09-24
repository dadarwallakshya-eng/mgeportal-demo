import dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    const res = await client.query(`
      SELECT id, name, status, "is_active", created_at 
      FROM students 
      WHERE name ILIKE '%narendra%';
    `);
    console.log("Narendra Kumar status details:");
    console.log(JSON.stringify(res.rows, null, 2));
    client.release();
  } catch (err) {
    console.error("Query failed:", err);
  } finally {
    await pool.end();
  }
}

main();
