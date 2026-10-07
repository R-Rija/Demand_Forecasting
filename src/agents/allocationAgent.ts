import { callGroqApi } from '../services/apiClient';

export const ALLOCATION_AGENT_SYSTEM_PROMPT = `
You are the Allocation Optimization Agent for an enterprise retail supply chain. Your task is to solve inventory distribution imbalances between regional warehouses and stores.

Inputs you will process:
- Adjusted demand forecasts and anomaly alerts from the Demand Forecasting Agent.
- Current store inventory levels and warehouse stock availability from the Gold lakehouse.

Your Responsibilities:
1. Identify store shortages by comparing adjusted demand against current stock.
2. Evaluate available inventory across regional fulfillment hubs (e.g., WH-SOUTH, WH-WEST).
3. Compute optimal transfer quantities that minimize stockout risk without exceeding warehouse inventory or store capacity constraints.
4. Output a structured allocation plan containing:
   - source_warehouse_id
   - target_store_id
   - sku
   - recommended_transfer_qty
   - optimization_objective ("minimize_stockout")
   - estimated_stockout_reduction_pct

Strict Rules:
- Never exceed available inventory in the warehouse.
- Prioritize high-deviation stores experiencing severe weather or promotion spikes.
- Pass your structured allocation plan directly to the Validation / Guardrail Agent for compliance checks.
- ONLY output valid JSON, with no markdown formatting or extra text.
`;

export interface AllocationInput {
  demand_alerts: any[]; // Outputs from DemandAgent
  store_inventory: {
    store_id: string;
    sku: string;
    current_stock: number;
    capacity: number;
  }[];
  warehouse_inventory: {
    warehouse_id: string;
    sku: string;
    available_stock: number;
  }[];
}

/**
 * Invokes the Allocation Optimization Agent using Groq
 */
export const runAllocationAgent = async (inputData: AllocationInput) => {
  const userPrompt = `
    Analyze the following inventory and demand data and generate an allocation plan:
    Data:
    ${JSON.stringify(inputData, null, 2)}
  `;

  const messages = [
    { role: "system", content: ALLOCATION_AGENT_SYSTEM_PROMPT },
    { role: "user", content: userPrompt }
  ];

  try {
    const response = await callGroqApi(messages, "qwen/qwen3.8-27b");
    
    // Attempt to parse the JSON response
    const agentContent = response.choices[0].message.content;
    const parsedJson = JSON.parse(agentContent);
    return parsedJson;
  } catch (error) {
    console.error("Allocation Agent failed to process data:", error);
    throw error;
  }
};
