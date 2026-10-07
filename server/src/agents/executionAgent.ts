import { query } from '../db.js';
import { logger, writeAgentLog } from '../log.js';

export async function runExecutionAgent() {
  logger.info('Starting Execution Agent');
  
  // Find approved allocations
  const approved = await query("SELECT * FROM dbo.FactAllocation WHERE Status = 'APPROVED'");
  let executedCount = 0;
  
  for (const row of approved.recordset) {
    // 1. "Execute" it by writing to FactPurchaseOrder / shipments (in this case, we insert into FactPurchaseOrder)
    const sql = `
      INSERT INTO dbo.FactPurchaseOrder (
        PONumber, OrderDateKey, SupplierKey, ProductKey, WarehouseKey,
        OrderedQty, UnitCost, ExpectedDeliveryDateKey, Status
      )
      SELECT 
        'PO-AGENT-' + CAST(@id AS VARCHAR(10)),
        CAST(CONVERT(VARCHAR(8), GETDATE(), 112) AS INT),
        1, @pk, @wh, @qty, p.UnitCost, 
        CAST(CONVERT(VARCHAR(8), DATEADD(DAY, 3, GETDATE()), 112) AS INT),
        'SHIPPED'
      FROM dbo.DimProduct p
      WHERE p.ProductKey = @pk;
      
      UPDATE dbo.FactAllocation
      SET Status = 'EXECUTED', ExecutedQty = @qty
      WHERE AllocationKey = @id;
    `;
    
    await query(sql, {
      pk: row.ProductKey,
      store: row.StoreKey,
      wh: row.WarehouseKey,
      qty: row.RecommendedQty,
      id: row.AllocationKey
    });
    
    executedCount++;
  }
  
  await writeAgentLog(
    'Execution Agent',
    'Execute Approved Actions',
    { executedCount }
  );
  
  logger.info(`Execution Agent executed ${executedCount} approved allocations.`);
  return { executed: executedCount };
}
