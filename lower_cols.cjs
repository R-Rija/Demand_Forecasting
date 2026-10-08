const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.SUPABASE_URI,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const { rows } = await pool.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
    `);

    for (const row of rows) {
      const table = row.table_name;
      const col = row.column_name;
      // if column has uppercase letters, rename it
      if (col.toLowerCase() !== col) {
        console.log(`Renaming ${table}."${col}" to "${col.toLowerCase()}"`);
        await pool.query(`ALTER TABLE "${table}" RENAME COLUMN "${col}" TO "${col.toLowerCase()}"`);
      }
    }
    console.log('All columns renamed to lowercase!');
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
