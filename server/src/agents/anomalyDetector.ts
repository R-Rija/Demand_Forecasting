import { query } from '../db.js';
import { logger, writeAgentLog } from '../log.js';

export async function runAnomalyDetector() {
  logger.info('Starting Anomaly Detector Agent');
  
  // Read from vw_AnomalyCandidates as specified
  // We're looking for where IsAnomaly = 1 OR where future adjusted > baseline * 1.15
  
  const sql = `
    SELECT c.* 
    FROM dbo.vw_AnomalyCandidates c
    WHERE c.IsAnomaly = 1
  `;
  
  const anomalies = await query(sql);
  
  await writeAgentLog(
    'Anomaly Detector Agent',
    'Detection Run',
    { found: anomalies.recordset.length }
  );

  logger.info(`Anomaly Detector found ${anomalies.recordset.length} anomalies.`);
  return anomalies.recordset;
}
