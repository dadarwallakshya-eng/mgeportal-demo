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
    const res = await client.query('SELECT id, username, name, role FROM users;');
    console.log("Portal Users:");
    console.log(JSON.stringify(res.rows, null, 2));
    client.release();
  } catch (err) {
    console.error("Query failed:", err);
  } finally {
    await pool.end();
  }
}

main();
