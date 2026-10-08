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
    
    console.log(pgQuery);
    const { rows } = await pool.query(pgQuery);
    return rows;
  } catch (err) {
    console.error("❌ Query Failed:", err.message);
    throw err;
  }
}

async function run() {
  try {
    await executeSql(`
        SELECT TOP 50
            a.AllocationKey, 
            a.Status, 
            a.Reason, 
            a.ExpectedDemand, 
            a.NewForecast,
            a.RecommendedQty, 
            a.EstimatedValue, 
            a.Drivers, 
            a.Confidence,
            st.Region, 
            p.SKU,
            ISNULL(dw.WarehouseName, 'Central Warehouse') AS SourceWarehouse,
            st.StoreName AS DestStore
        FROM dbo.FactAllocation a
        JOIN dbo.DimStore st ON st.StoreKey = a.StoreKey
        JOIN dbo.DimProduct p ON p.ProductKey = a.ProductKey
        LEFT JOIN dbo.DimWarehouse dw ON dw.WarehouseKey = a.WarehouseKey
        WHERE a.Status = 'PENDING'
        ORDER BY 
            CASE WHEN a.Status = 'PENDING' THEN 0 ELSE 1 END,
            a.DateKey DESC
    `);
  } finally {
    pool.end();
  }
}
run();
