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
      SELECT t.id, t.direction, t.category, t.amount, t.date, t.description, t.unit_id, t.created_at
      FROM "transactions" t
      WHERE t.created_at >= '2026-07-15T00:00:00.000Z'
      ORDER BY t.created_at DESC;
    `);
    
    console.log("Recent Transactions (since July 15):");
    console.log(JSON.stringify(res.rows, null, 2));

    client.release();
  } catch (err) {
    console.error("Query failed:", err);
  } finally {
    await pool.end();
  }
}

main();
