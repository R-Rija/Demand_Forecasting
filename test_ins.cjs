require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.SUPABASE_URI, ssl: { rejectUnauthorized: false } });

async function executeSql(query) {
    let pgQuery = query.replace(/dbo\./g, 'public.');
    
    const tables = ['DimDate', 'DimProduct', 'DimStore', 'DimWarehouse', 'FactInventory', 'FactWarehouseInventory', 'FactSales', 'FactForecast', 'FactAllocation', 'AgentActionLog', 'GuardrailConfig', 'RegionSafetyStock', 'FactForecastAccuracy'];
    for(const t of tables) { pgQuery = pgQuery.replace(new RegExp(`public\\.${t}`, 'gi'), `public."${t}"`); }
    
    console.log(pgQuery);
    const { rows } = await pool.query(pgQuery);
    return rows;
}

async function test() {
  try {
    const allocationKey = 3829;
    const newStatus = 'APPROVED';
    const logQ = `
      INSERT INTO dbo.AgentActionLog (EventTime, AgentName, ActionType, StoreKey, ProductKey, Details, Status, ApprovedBy)
      SELECT
        NOW(),
        'Human Operator',
        'Recommendation ${newStatus}',
        fa.StoreKey,
        fa.ProductKey,
        CONCAT('Allocation #${allocationKey} ${newStatus} by operator. Qty: ', fa.RecommendedQty),
        '${newStatus}',
        'Human Operator'
      FROM dbo.FactAllocation fa
      WHERE fa.AllocationKey = ${parseInt(allocationKey)}
    `;
    
    await executeSql(logQ);
    console.log('success');
  } catch(e) {
    console.log('error:', e.message);
  } finally {
    pool.end();
  }
}
test();
