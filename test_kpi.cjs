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
    
    // Add views to quotes!
    const views = ['vw_ForecastVsActual', 'vw_CurrentStockStatus', 'vw_WarehouseAvailable', 'vw_StoreCapacityUsage', 'vw_AnomalyCandidates', 'vw_ForecastAccuracySummary'];
    for(const v of views) { pgQuery = pgQuery.replace(new RegExp(`public\\.${v}`, 'gi'), `public."${v}"`); }
    
    const { rows } = await pool.query(pgQuery);
    
    const mappedRows = rows.map(row => {
      const newRow = {};
      for (const key of Object.keys(row)) {
        const regex = new RegExp(`\\b${key}\\b`, 'i');
        const match = query.match(regex);
        if (match) {
          newRow[match[0]] = row[key];
        } else {
          newRow[key] = row[key];
        }
      }
      return newRow;
    });
    return mappedRows;
  } catch (err) {
    console.error("❌ Query Failed:", err.message);
    throw err;
  }
}

async function run() {
  try {
    const accuracyData = await executeSql(`
        SELECT TOP 1 Accuracy_Adjusted, WAPE_Adjusted, RowsEvaluated
        FROM dbo.vw_ForecastAccuracySummary
        ORDER BY RowsEvaluated DESC
    `);
    console.log('accuracyData:', accuracyData);
    
    const productCount = await executeSql(`SELECT COUNT(*) as cnt FROM dbo.DimProduct`);
    console.log('productCount:', productCount);
    
    const anomalyData = await executeSql(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN IsAnomaly = 1 THEN 1 ELSE 0 END) AS anomalies
        FROM dbo.vw_AnomalyCandidates
    `);
    console.log('anomalyData:', anomalyData);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
