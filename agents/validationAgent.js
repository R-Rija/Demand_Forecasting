/**
 * Validation & Guardrail Agent
 * Deterministically checks an allocation plan against hard limits.
 */
export function runValidation(allocationPlan, context) {
  const {
    warehouse_capacity, labor_capacity, transport_capacity, 
    resulting_store_inventory, safety_stock, current_store_inventory,
    supplier_capacity, forecast_confidence, is_new_or_high_value
  } = context;

  const { recommended_transfer_qty, estimated_transport_cost_inr } = allocationPlan;

  const checks = {
    warehouse_capacity: warehouse_capacity >= recommended_transfer_qty ? "PASS" : "FAIL",
    labor: labor_capacity >= recommended_transfer_qty ? "PASS" : "FAIL",
    transport: transport_capacity >= recommended_transfer_qty ? "PASS" : "FAIL",
    safety_stock: resulting_store_inventory >= safety_stock ? "PASS" : "FAIL",
    budget: estimated_transport_cost_inr <= 500000 ? "PASS" : "FAIL"
  };

  const inventoryIncreasePct = (recommended_transfer_qty / current_store_inventory) * 100;
  
  let status = "APPROVED";
  let reason = "All guardrails passed.";
  let recommended_adjustment = null;

  // Check failures
  if (Object.values(checks).includes("FAIL")) {
    status = "REJECTED";
    reason = "One or more capacity or budget constraints failed.";
    recommended_adjustment = "Reduce recommended transfer quantity to fit within lowest bottleneck.";
    return { status, checks, reason, recommended_adjustment };
  }

  // Check allocation/supplier caps
  if (inventoryIncreasePct > 30) {
    status = "REJECTED";
    reason = `Store inventory increase (${inventoryIncreasePct.toFixed(1)}%) exceeds 30% limit.`;
    recommended_adjustment = "Cap transfer to 30% of current inventory.";
    return { status, checks, reason, recommended_adjustment };
  }

  if (recommended_transfer_qty > supplier_capacity) {
    status = "REJECTED";
    reason = "Exceeds supplier capacity.";
    recommended_adjustment = "Source balance from alternate supplier.";
    return { status, checks, reason, recommended_adjustment };
  }

  // Check human-in-the-loop triggers
  if (is_new_or_high_value) {
    status = "HUMAN_APPROVAL_REQUIRED";
    reason = "SKU is flagged as new or high-value.";
    return { status, checks, reason, recommended_adjustment };
  }

  if (forecast_confidence < 0.80) {
    status = "HUMAN_APPROVAL_REQUIRED";
    reason = "Forecast confidence below 80%.";
    return { status, checks, reason, recommended_adjustment };
  }

  return { status, checks, reason, recommended_adjustment };
}
