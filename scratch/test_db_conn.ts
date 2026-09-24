import dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  console.log("DATABASE_URL from env:", connectionString);

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("Connecting using pg Pool...");
    const client = await pool.connect();
    console.log("Connected successfully!");
    const res = await client.query('SELECT NOW()');
    console.log("Query result:", res.rows[0]);
    client.release();
  } catch (err) {
    console.error("Connection failed:", err);
  } finally {
    await pool.end();
  }
}

main();
