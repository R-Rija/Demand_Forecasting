import { query, loadGuardrails } from '../db.js';
import { logger, writeAgentLog } from '../log.js';
import { config } from '../config.js';

export async function runValidationAgent() {
  logger.info('Starting Validation & Guardrail Agent');
  
  // Reload guardrails from DB
  const guardrails = await loadGuardrails();
  
  // Fetch pending allocations
  const pending = await query("SELECT * FROM dbo.FactAllocation WHERE Status = 'PENDING'");
  
  let approved = 0;
  let rejected = 0;
  let human = 0;
  
  for (const row of pending.recordset) {
    let isValid = true;
    let reason = '';
    let approvalType = 'AUTOMATIC';
    
    // Guardrail 1: MaxStoreIncreasePct (e.g. 30%)
    const maxIncrease = guardrails['MaxStoreIncreasePct'] || 30;
    
    // We need current store inventory to check this
    const invRes = await query(`
      SELECT AvailableQty FROM dbo.FactInventory 
      WHERE StoreKey=@store AND ProductKey=@pk 
      AND DateKey=(SELECT MAX(DateKey) FROM dbo.FactInventory)
    `, { store: row.StoreKey, pk: row.ProductKey });
    
    const currentInv = invRes.recordset[0]?.AvailableQty || 1; // avoid div by 0
    const increasePct = (row.RecommendedQty / currentInv) * 100;
    
    if (increasePct > maxIncrease) {
      isValid = false;
      reason = `Rejected: Exceeds max store inventory increase limit (${Math.round(increasePct)}% > ${maxIncrease}%).`;
    }
    
    // Guardrail 2: MaxAutoTransferValueINR
    const maxAutoVal = guardrails['MaxAutoTransferValueINR'] || 10000;
    if (isValid && row.EstimatedValue > maxAutoVal) {
      approvalType = 'HUMAN';
      reason = `Requires Human Approval: Value (${row.EstimatedValue} INR) exceeds auto threshold.`;
    }
    
    // Guardrail 3: ConfidenceThreshold
    const minConf = (guardrails['ConfidenceThresholdPct'] || 80) / 100;
    if (isValid && row.Confidence < minConf) {
      approvalType = 'HUMAN';
      reason = reason ? `${reason} Also, Confidence (${Math.round(row.Confidence*100)}%) is below threshold.` 
                      : `Requires Human Approval: Confidence (${Math.round(row.Confidence*100)}%) is below threshold.`;
    }
    
    let status = isValid ? (approvalType === 'HUMAN' ? 'PENDING_APPROVAL' : 'APPROVED') : 'REJECTED';
    
    await query(`
      UPDATE dbo.FactAllocation 
      SET Status = @status, ApprovalType = @type, ValidationNotes = @notes 
      WHERE AllocationKey = @id
    `, {
      status, type: approvalType, notes: reason || 'Passed all guardrails.', id: row.AllocationKey
    });
    
    if (status === 'APPROVED') approved++;
    else if (status === 'REJECTED') rejected++;
    else {
      human++;
      logger.info(`[EMAIL NOTIFICATION] Sent email to Supply Chain Manager for Approval. Link: http://localhost:5190?tab=recommendations`);
    }
  }
  
  await writeAgentLog(
    'Validation Agent',
    'Guardrail Check',
    { processed: pending.recordset.length, approved, rejected, pendingHuman: human }
  );
  
  logger.info(`Validation Agent processed ${pending.recordset.length} allocations (${approved} approved, ${rejected} rejected, ${human} need human).`);
  return { approved, rejected, human };
}
