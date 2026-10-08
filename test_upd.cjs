require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.SUPABASE_URI, ssl: { rejectUnauthorized: false } });

async function test() {
  try {
    const res = await pool.query('UPDATE public."FactAllocation" SET Status = \'APPROVED\' WHERE AllocationKey = 3829');
    console.log('success', res.rowCount);
  } catch(e) {
    console.log('error:', e.message);
  } finally {
    pool.end();
  }
}
test();
