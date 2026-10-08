require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.SUPABASE_URI, ssl: { rejectUnauthorized: false } });
pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'FactAllocation'").then(r => console.log(r.rows)).catch(e => console.log(e)).finally(()=>pool.end());
