import { runForecast } from './forecastAgent.js';
import { runAllocation } from './allocationAgent.js';
import { runValidation } from './validationAgent.js';
import { runExecution } from './executionAgent.js';

// STUB: Writes to Fabric Gold Lakehouse (gold_forecast, gold_agent_recommendations, etc)
async function writeToLakehouse(tableName, data) {
  // In a real scenario, this would use tedious to execute an INSERT statement
  console.log(`[DB WRITE] -> ${tableName}:`, JSON.stringify(data).substring(0, 50) + "...");
}

/**
 * The Central Orchestrator
 * Sequences the agents and enforces handoff rules.
 */
export async function runPipeline(inputs, context) {
  const logs = [];
  const emitLog = (agentId, message, tone) => {
    const log = { time: new Date().toISOString(), agentId, message, tone };
    logs.push(log);
    console.log(`[${log.time}] [${agentId}] [${tone}] ${message}`);
  };

  try {
    // 1. Forecast Agent
    emitLog("forecast", "Starting forecast generation...", "info");
    const forecast = await runForecast(inputs);
    await writeToLakehouse("gold_forecast", forecast);
    
    // Deviation check
    const deviationThreshold = inputs.volume === 'high' ? 0.10 : 0.15; // Simplified
    if (Math.abs(forecast.deviation) <= deviationThreshold) {
      emitLog("forecast", `Deviation (${(forecast.deviation*100).toFixed(1)}%) below threshold. Stopping pipeline.`, "success");
      return { status: "STOPPED", logs };
    }
    
    if (forecast.requires_human_approval) {
      emitLog("forecast", "Forecast confidence too low. Requires human approval.", "warn");
      return { status: "HUMAN_APPROVAL_REQUIRED", forecast, logs };
    }

    emitLog("forecast", `Significant deviation detected (${(forecast.deviation*100).toFixed(1)}%). Proceeding to Allocation.`, "info");

    // 2. Allocation Agent
    emitLog("allocation", "Calculating optimal transfer plan...", "info");
    const allocationPlan = await runAllocation(forecast, context.inventory);
    
    emitLog("allocation", `Transfer plan generated for ${allocationPlan.recommended_transfer_qty} units.`, "success");

    // 3. Validation Agent
    emitLog("validation", "Running deterministic guardrails...", "info");
    const validation = runValidation(allocationPlan, context.validation);
    
    if (validation.status === "REJECTED" || validation.status === "HUMAN_APPROVAL_REQUIRED") {
      emitLog("validation", `Plan blocked: ${validation.reason}`, "error");
      return { status: validation.status, reason: validation.reason, partial_plan: allocationPlan, logs };
    }

    emitLog("validation", "All guardrails passed.", "success");

    // 4. Execution Agent
    emitLog("execution", "Preparing execution artifacts...", "info");
    const execution = await runExecution(validation, allocationPlan, null);
    await writeToLakehouse("gold_agent_recommendations", execution);
    
    emitLog("execution", `Created transfer order ${execution.transfer_order_id} (${execution.approval_status})`, "success");

    return { status: "COMPLETED", execution, logs };

  } catch (error) {
    emitLog("orchestrator", `Pipeline failed: ${error.message}`, "error");
    return { status: "ERROR", error: error.message, logs };
  }
}
