const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.SUPABASE_URI,
  ssl: { rejectUnauthorized: false }
});

async function executeSql(query) {
  try {
    let pgQuery = query.replace(/dbo\./g, 'public.');
    pgQuery = pgQuery.replace(/SELECT\s+TOP\s+(\d+)(.*?)FROM/gis, "SELECT $2 FROM");
    const topMatch = query.match(/SELECT\s+TOP\s+(\d+)/i);
    if (topMatch) { pgQuery += ` LIMIT ${topMatch[1]}`; }
    pgQuery = pgQuery.replace(/ISNULL\(/gi, 'COALESCE(');
    if (pgQuery.includes("DATEADD(DAY, -7, CAST(CONVERT(VARCHAR, (SELECT MAX(DateKey)")) {
        pgQuery = pgQuery.replace(/DATEADD\(DAY,\s*-7,\s*CAST\(CONVERT\(VARCHAR,\s*\(SELECT MAX\(DateKey\) FROM public\.FactWarehouseInventory\),\s*112\)\s*AS DATE\)\)/gi, 
            "(TO_DATE((SELECT MAX(\"DateKey\") FROM public.\"FactWarehouseInventory\")::text, 'YYYYMMDD') - INTERVAL '7 days')");
    }
    const tables = ['DimProduct', 'DimStore', 'DimWarehouse', 'FactWarehouseInventory', 'FactSales', 'FactForecast', 'FactAllocation', 'AgentActionLog', 'GuardrailConfig', 'RegionSafetyStock', 'FactForecastAccuracy'];
    for(const t of tables) { pgQuery = pgQuery.replace(new RegExp(`public\\.${t}`, 'gi'), `public."${t}"`); }
    
    console.log('Final Query:', pgQuery);
    const { rows } = await pool.query(pgQuery);
    return rows;
  } catch (err) {
    console.error("❌ Query Failed:", err.message, "\nQuery:", query);
    throw err;
  }
}

async function run() {
  const query = `
    SELECT 
      SUM(ISNULL(SalesAmount, 0)) as totalRevenue,
      SUM(ISNULL(SalesQuantity, 0)) as totalSalesUnits,
      COUNT(DISTINCT ProductKey) as totalProducts
    FROM dbo.FactSales
  `;
  try {
    const res = await executeSql(query);
    console.log('Result:', res);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    pool.end();
  }
}

run();
