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
      SELECT t.id, t.direction, t.category, t.amount, t.date, t.description, t.unit_id, u.name as unit_name, t.is_deleted
      FROM "transactions" t
      LEFT JOIN "units" u ON t.unit_id = u.id
      WHERE t.category = 'TRANSPORT'
      ORDER BY t.date DESC, t.created_at DESC;
    `);
    
    console.log("Transport Transactions:");
    console.log(JSON.stringify(res.rows, null, 2));

    client.release();
  } catch (err) {
    console.error("Query failed:", err);
  } finally {
    await pool.end();
  }
}

main();
