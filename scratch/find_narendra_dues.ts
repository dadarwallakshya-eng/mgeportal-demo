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
    
    // Find Narendra's ID
    const studentRes = await client.query("SELECT id, name FROM students WHERE name ILIKE '%narendra%' LIMIT 1;");
    if (studentRes.rows.length === 0) {
      console.log("Narendra not found.");
      return;
    }
    const student = studentRes.rows[0];
    console.log("Found student:", student);

    // Query fee allocations
    const allocRes = await client.query(`
      SELECT fa.id, fa.amount_due, fa.amount_paid, fa.status, fc.name as component_name
      FROM "fee_allocations" fa
      JOIN "fee_components" fc ON fa.fee_component_id = fc.id
      WHERE fa.student_id = $1;
    `, [student.id]);
    
    console.log("Fee Allocations:");
    console.log(JSON.stringify(allocRes.rows, null, 2));

    // Query concessions
    const concessionsRes = await client.query(`
      SELECT id, fee_component_name, discount_type, value 
      FROM "student_concessions" 
      WHERE student_id = $1;
    `, [student.id]);
    
    console.log("Concessions:");
    console.log(JSON.stringify(concessionsRes.rows, null, 2));

    client.release();
  } catch (err) {
    console.error("Query failed:", err);
  } finally {
    await pool.end();
  }
}

main();
