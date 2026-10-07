import { runForecastAgent } from './forecastAgent.js';
import { runAnomalyDetector } from './anomalyDetector.js';
import { runAllocationAgent } from './allocationAgent.js';
import { runValidationAgent } from './validationAgent.js';
import { runExecutionAgent } from './executionAgent.js';
import { logger } from '../log.js';

export async function runPipeline(scope = {}, horizonDays = 7) {
  logger.info('=== STARTING RETAIL AI PIPELINE ===');
  
  // 1. Forecast
  await runForecastAgent(scope, horizonDays);
  
  // 2. Detect Anomalies (Optional, primarily for UI/logging)
  await runAnomalyDetector();
  
  // 3. Allocate based on forecast vs actual inventory
  const allocRes = await runAllocationAgent();
  
  // 4. Validate against Guardrails
  if (allocRes.generated > 0) {
    await runValidationAgent();
  }
  
  // 5. Execute Approved ones
  await runExecutionAgent();
  
  logger.info('=== PIPELINE COMPLETED ===');
  return { status: 'Success' };
}
