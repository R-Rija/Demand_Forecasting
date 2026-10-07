/**
 * Execution Agent
 * Creates operational artifacts (Transfer Order / PO) if bounds permit.
 */
export async function runExecution(validationResult, allocationPlan, recommendationId) {
  const { status } = validationResult;
  const { recommended_transfer_qty, estimated_transport_cost_inr, source_warehouse, destination_store } = allocationPlan;

  if (status !== "APPROVED") {
    throw new Error("Execution Agent cannot process unapproved plans.");
  }

  // Automation Matrix
  let approval_status = "Created";
  
  if (estimated_transport_cost_inr > 50000) {
    approval_status = "Pending Approval"; // Exceeds auto PO threshold
  }
  
  // Note: We are forcing Level 1 human-in-the-loop per global rules
  approval_status = "Pending Approval"; 

  // Simulate ERP API call
  await new Promise(resolve => setTimeout(resolve, 300));
  const transfer_order_id = `TR-${Math.floor(Math.random() * 100000)}`;

  // Priority heuristic
  let priority = "LOW";
  if (recommended_transfer_qty > 500) priority = "HIGH";
  else if (recommended_transfer_qty > 100) priority = "MEDIUM";

  // Exact Output Schema Required
  return {
    recommendation_id: recommendationId || `REC-${Math.floor(Math.random() * 10000)}`,
    transfer_order_id,
    route: `${source_warehouse} -> ${destination_store}`,
    transfer_quantity: recommended_transfer_qty,
    priority,
    approval_status
  };
}
