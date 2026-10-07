import { query } from '../db.js';
import { logger, writeAgentLog } from '../log.js';

export async function runAllocationAgent() {
  logger.info('Starting Allocation Optimizer Agent');
  
  // Find anomalies that need allocation
  // Here we identify store/SKU combinations where AdjustedForecast > AvailableQty + InTransitQty
  // and status is pending allocation.
  // For simplicity, we just look at the latest forecast where Adjusted > Baseline * 1.10
  
  const sql = `
    WITH Shortages AS (
      SELECT 
        f.DateKey, f.StoreKey, f.ProductKey,
        f.AdjustedForecast, f.BaselineForecast,
        ISNULL(i.AvailableQty, 0) AS CurrentStock,
        f.PrimaryDriver, f.Confidence
      FROM dbo.FactForecast f
      LEFT JOIN dbo.FactInventory i ON i.StoreKey = f.StoreKey AND i.ProductKey = f.ProductKey
         AND i.DateKey = (SELECT MAX(DateKey) FROM dbo.FactInventory)
      WHERE f.ModelVersion = 'agent-v1'
        AND f.AdjustedForecast > f.BaselineForecast * 1.15
        AND f.AdjustedForecast > ISNULL(i.AvailableQty, 0)
    )
    SELECT * FROM Shortages;
  `;
  
  const shortages = await query(sql);
  let recommendedCount = 0;
  
  for (const row of shortages.recordset) {
    const shortageQty = Math.ceil(row.AdjustedForecast - row.CurrentStock);
    
    // Check warehouse inventory
    const whSql = `
      SELECT TOP 1 WarehouseKey, AvailableQty 
      FROM dbo.FactWarehouseInventory 
      WHERE ProductKey = @pk AND AvailableQty >= @qty
      ORDER BY AvailableQty DESC
    `;
    const whRes = await query(whSql, { pk: row.ProductKey, qty: shortageQty });
    
    let whKey = null;
    let finalQty = shortageQty;
    
    if (whRes.recordset.length > 0) {
      whKey = whRes.recordset[0].WarehouseKey;
    } else {
      // Not enough in any single warehouse, just take what we can from the largest
      const whSql2 = `SELECT TOP 1 WarehouseKey, AvailableQty FROM dbo.FactWarehouseInventory WHERE ProductKey = @pk ORDER BY AvailableQty DESC`;
      const whRes2 = await query(whSql2, { pk: row.ProductKey });
      if (whRes2.recordset.length > 0 && whRes2.recordset[0].AvailableQty > 0) {
        whKey = whRes2.recordset[0].WarehouseKey;
        finalQty = whRes2.recordset[0].AvailableQty;
      }
    }
    
    if (finalQty > 0) {
      // Calculate estimated value (qty * selling price)
      const priceRes = await query('SELECT SellingPrice FROM dbo.DimProduct WHERE ProductKey=@pk', { pk: row.ProductKey });
      const price = priceRes.recordset[0]?.SellingPrice || 100;
      const estValue = finalQty * price;
      
      // INSERT into FactAllocation as PENDING
      const insertSql = `
        IF NOT EXISTS (
          SELECT 1 FROM dbo.FactAllocation 
          WHERE DateKey = @date AND StoreKey = @store AND ProductKey = @pk AND WarehouseKey = @wh
        )
        BEGIN
          INSERT INTO dbo.FactAllocation (
            DateKey, WarehouseKey, StoreKey, ProductKey, RecommendedQty, 
            Status, ApprovalType, Reason, ExpectedDemand, NewForecast, 
            Drivers, Confidence, EstimatedValue
          ) VALUES (
            @date, @wh, @store, @pk, @qty,
            'PENDING', 'HUMAN', @reason, @base, @adj,
            @driver, @conf, @val
          )
        END
      `;
      await query(insertSql, {
        date: row.DateKey,
        wh: whKey,
        store: row.StoreKey,
        pk: row.ProductKey,
        qty: finalQty,
        reason: 'Demand spike detected',
        base: row.BaselineForecast,
        adj: row.AdjustedForecast,
        driver: row.PrimaryDriver,
        conf: row.Confidence,
        val: estValue
      });
      recommendedCount++;
    }
  }
  
  await writeAgentLog(
    'Allocation Optimizer Agent',
    'Generate Recommendations',
    { shortagesDetected: shortages.recordset.length, recommendationsCreated: recommendedCount }
  );
  
  logger.info(`Allocation Agent generated ${recommendedCount} recommendations.`);
  return { generated: recommendedCount };
}
