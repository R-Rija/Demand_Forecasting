const sql = require('mssql');
const { Client } = require('pg');
require('dotenv').config();

const PG_URI = process.env.SUPABASE_URI; // I will pass this directly in the code or env
const PG_PASSWORD = 'YOUR_PASSWORD'; // To be replaced

const pgClient = new Client({
  connectionString: PG_URI
});

const mssqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: true, trustServerCertificate: true }
};

const mapType = (type, maxLength) => {
  type = type.toLowerCase();
  if (['int', 'tinyint', 'smallint'].includes(type)) return 'INTEGER';
  if (type === 'bigint') return 'BIGINT';
  if (['decimal', 'numeric', 'money', 'smallmoney', 'float', 'real'].includes(type)) return 'NUMERIC';
  if (type === 'bit') return 'BOOLEAN';
  if (['datetime', 'smalldatetime', 'datetime2', 'date', 'time'].includes(type)) return 'TIMESTAMP';
  if (type === 'uniqueidentifier') return 'UUID';
  return 'TEXT';
};

async function migrate() {
  console.log("Connecting to Postgres...");
  await pgClient.connect();
  console.log("Connecting to MSSQL...");
  await sql.connect(mssqlConfig);

  const tablesRes = await sql.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'");
  const tables = tablesRes.recordset.map(r => r.TABLE_NAME);

  for (const table of tables) {
    console.log(`Processing table: ${table}`);
    
    // Get Schema
    const colsRes = await sql.query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${table}'
      ORDER BY ORDINAL_POSITION
    `);
    
    let createTable = `CREATE TABLE IF NOT EXISTS "${table}" (\n`;
    const colDefs = colsRes.recordset.map(c => `  "${c.COLUMN_NAME}" ${mapType(c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH)}`);
    createTable += colDefs.join(',\n') + '\n);';
    
    // Drop existing table to ensure clean state
    await pgClient.query(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
    await pgClient.query(createTable);
    console.log(`Created table ${table} in Postgres.`);

    // Migrate Data
    const dataRes = await sql.query(`SELECT * FROM ${table}`);
    const rows = dataRes.recordset;
    if (rows.length === 0) {
      console.log(`No data in ${table}`);
      continue;
    }

    const columns = Object.keys(rows[0]);
    // Bulk insert in chunks of 1000
    const chunkSize = 1000;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      let valuesStr = [];
      let flatValues = [];
      let paramIndex = 1;
      
      for (const row of chunk) {
        let rowParams = [];
        for (const col of columns) {
          rowParams.push(`$${paramIndex++}`);
          flatValues.push(row[col]);
        }
        valuesStr.push(`(${rowParams.join(', ')})`);
      }

      const insertQuery = `INSERT INTO "${table}" ("${columns.join('", "')}") VALUES ${valuesStr.join(', ')}`;
      await pgClient.query(insertQuery, flatValues);
    }
    console.log(`Migrated ${rows.length} rows for ${table}`);
  }

  console.log("Migration Complete!");
  sql.close();
  pgClient.end();
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
