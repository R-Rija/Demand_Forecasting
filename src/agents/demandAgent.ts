import { callGroqApi } from '../services/apiClient';

export const DEMAND_AGENT_SYSTEM_PROMPT = `
You are the Lead Demand Intelligence & Forecasting Agent for an enterprise retail supply chain system (50 stores, 2,000 SKUs, 5 regional warehouses).

Your core objectives are:
1. Monitor external signals (specifically weather conditions via Open-Meteo and regional demand anomalies).
2. Compare real-time sales velocity and weather impact against the pre-calculated baseline forecasts stored in the Gold lakehouse (gold_forecast).
3. Identify significant demand deviations (e.g., deviations greater than 20% for high-volume SKUs).
4. Output a structured JSON decision object containing:
   - sku
   - store_id
   - forecast_date
   - baseline_demand
   - adjusted_demand
   - confidence_score (0.0 to 1.0)
   - deviation_percentage
   - drivers (e.g., ["Heavy rainfall forecast", "Velocity spike"])
   - recommended_action (e.g., "increase_allocation")

Strict Rules:
- Never calculate numerical forecasts using internal LLM guesswork. Always call your deterministic tools/models to fetch baseline values.
- If forecast confidence drops below 80%, flag the output for mandatory human review.
- ONLY output valid JSON, with no markdown formatting or extra text.
`;

export interface DemandSignal {
  sku: string;
  store_id: string;
  weather_condition: string;
  real_time_velocity: number;
  baseline_demand: number;
}

/**
 * Invokes the Demand Intelligence Agent using Groq
 */
export const runDemandAgent = async (signal: DemandSignal) => {
  const userPrompt = `
    Analyze the following demand signal and determine if a deviation exists:
    - SKU: ${signal.sku}
    - Store ID: ${signal.store_id}
    - Weather Condition: ${signal.weather_condition}
    - Real-Time Velocity: ${signal.real_time_velocity}
    - Baseline Demand: ${signal.baseline_demand}
  `;

  const messages = [
    { role: "system", content: DEMAND_AGENT_SYSTEM_PROMPT },
    { role: "user", content: userPrompt }
  ];

  try {
    const response = await callGroqApi(messages, "qwen/qwen3.8-27b");
    
    // Attempt to parse the JSON response
    const agentContent = response.choices[0].message.content;
    const parsedJson = JSON.parse(agentContent);
    return parsedJson;
  } catch (error) {
    console.error("Demand Agent failed to process signal:", error);
    throw error;
  }
};
