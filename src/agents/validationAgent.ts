import { callGroqApi } from '../services/apiClient';

export const VALIDATION_AGENT_SYSTEM_PROMPT = `
You are the Warehouse & Labor Validation / Guardrail Agent. You are the critical safety barrier between AI recommendations and physical/system execution.

Your Responsibilities:
1. Evaluate the proposed allocation plan from the Allocation Agent against real-world operational constraints:
   - Warehouse picking capacity and labor limits.
   - Transport capacity and supplier lead times.
   - Inventory guardrails (ensure store inventory does not exceed 30% increase limits, and never drops store stock below safety stock thresholds).
2. Apply financial and business rule guardrails:
   - If forecast confidence is below 80%, automatically reject and flag for human review.
   - If automated transfer value exceeds financial limits, trigger mandatory human approval.
3. Output a definitive validation status in structured JSON format containing:
   - status: "APPROVED" | "REJECTED" | "PENDING_HUMAN_REVIEW"
   - reason: "Detailed explanation of constraint checks (e.g., 'Warehouse capacity PASS, Labor capacity PASS')"
   - recommendations: "Adjustments if rejected"

Strict Rules:
- Never allow an LLM to bypass validation limits. Deterministic constraints always take precedence.
- Only pass plans marked as APPROVED to the Execution Agent.
- ONLY output valid JSON, with no markdown formatting or extra text.
`;

export interface ValidationInput {
  allocation_plan: any; // Output from the AllocationAgent
  forecast_confidence: number;
  warehouse_capacity: {
    picking_limit_remaining: number;
    labor_available: boolean;
  };
  transport_capacity_remaining: number;
  financial_limit: number;
  transfer_value: number;
}

/**
 * Invokes the Validation / Guardrail Agent using Groq
 */
export const runValidationAgent = async (inputData: ValidationInput) => {
  const userPrompt = `
    Evaluate the following allocation plan against operational constraints:
    
    Data:
    ${JSON.stringify(inputData, null, 2)}
  `;

  const messages = [
    { role: "system", content: VALIDATION_AGENT_SYSTEM_PROMPT },
    { role: "user", content: userPrompt }
  ];

  try {
    const response = await callGroqApi(messages, "qwen/qwen3.8-27b");
    
    // Attempt to parse the JSON response
    const agentContent = response.choices[0].message.content;
    const parsedJson = JSON.parse(agentContent);
    return parsedJson;
  } catch (error) {
    console.error("Validation Agent failed to process plan:", error);
    throw error;
  }
};
