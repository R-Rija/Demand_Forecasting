const sql = require('mssql');
const { Pool } = require('pg');
require('dotenv').config();

const mssqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: true, trustServerCertificate: true }
};

const pgPool = new Pool({
  connectionString: process.env.SUPABASE_URI,
  ssl: { rejectUnauthorized: false }
});

async function migrateViews() {
  await sql.connect(mssqlConfig);
  const result = await sql.query(`
    SELECT name as TABLE_NAME, OBJECT_DEFINITION(object_id) as VIEW_DEFINITION 
    FROM sys.views
  `);
  
  for (const row of result.recordset) {
    console.log('View:', row.TABLE_NAME);
    let def = row.VIEW_DEFINITION;
    if (!def) {
      console.log('Skipping null definition for', row.TABLE_NAME);
      continue;
    }
    
    // Convert MSSQL view to Postgres view
    def = def.replace(/dbo\./g, 'public.');
    def = def.replace(/ISNULL\(/gi, 'COALESCE(');
    def = def.replace(/CONVERT\(VARCHAR,\s*GETDATE\(\),\s*112\)/gi, "TO_CHAR(NOW(), 'YYYYMMDD')");
    def = def.replace(/GETDATE\(\)/gi, 'NOW()');
    
    // Postgres requires column names to match exactly or use lowercase. Since our tables are lowercase now:
    const tables = ['DimProduct', 'DimStore', 'DimWarehouse', 'FactWarehouseInventory', 'FactSales', 'FactForecast', 'FactAllocation', 'AgentActionLog', 'GuardrailConfig', 'RegionSafetyStock', 'FactForecastAccuracy'];
    for(const t of tables) { def = def.replace(new RegExp(`public\\.${t}`, 'gi'), `public."${t}"`); }
    
    // For every column in the view, we'll just let Postgres figure it out.
    // Wait, the tables in Postgres have LOWERCASE column names!
    // So the view definition needs to reference the lowercase column names, which it will if unquoted!
    // Except Postgres unquoted is case-insensitive, so it matches the lowercase columns perfectly!
    
    // Drop view if exists
    try {
        await pgPool.query(`DROP VIEW IF EXISTS "public"."${row.TABLE_NAME}" CASCADE;`);
    } catch(e) {}
    
    // Create view
    const createStmt = def.replace(/CREATE VIEW/i, 'CREATE OR REPLACE VIEW');
    try {
        console.log('Creating view in PG:', createStmt.substring(0, 50) + '...');
        await pgPool.query(createStmt);
        console.log('Success!');
    } catch (e) {
        console.error('Error creating view:', e.message);
    }
  }
  
  sql.close();
  pgPool.end();
}

migrateViews();
