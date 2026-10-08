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
    
    const tables = ['DimDate', 'DimProduct', 'DimStore', 'DimWarehouse', 'FactInventory', 'FactWarehouseInventory', 'FactSales', 'FactForecast', 'FactAllocation', 'AgentActionLog', 'GuardrailConfig', 'RegionSafetyStock', 'FactForecastAccuracy'];
    for(const t of tables) { pgQuery = pgQuery.replace(new RegExp(`public\\.${t}`, 'gi'), `public."${t}"`); }
    
    const views = ['vw_ForecastVsActual', 'vw_CurrentStockStatus', 'vw_WarehouseAvailable', 'vw_StoreCapacityUsage', 'vw_AnomalyCandidates', 'vw_ForecastAccuracySummary'];
    for(const v of views) { pgQuery = pgQuery.replace(new RegExp(`public\\.${v}`, 'gi'), `public."${v}"`); }
    
    const { rows } = await pool.query(pgQuery);
    return rows;
  } catch (err) {
    console.error("❌ Query Failed:", err.message);
    throw err;
  }
}

async function run() {
  try {
    await executeSql(`SELECT * FROM dbo.GuardrailConfig`);
  } finally {
    pool.end();
  }
}
run();
