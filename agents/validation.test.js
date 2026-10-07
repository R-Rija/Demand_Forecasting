import test from 'node:test';
import assert from 'node:assert';
import { runValidation } from './validationAgent.js';

test('Validation Agent - Happy Path', (t) => {
  const plan = { recommended_transfer_qty: 100, estimated_transport_cost_inr: 50000 };
  const ctx = {
    warehouse_capacity: 500, labor_capacity: 500, transport_capacity: 200,
    resulting_store_inventory: 150, safety_stock: 50, current_store_inventory: 400,
    supplier_capacity: 1000, forecast_confidence: 0.9, is_new_or_high_value: false
  };
  const result = runValidation(plan, ctx);
  assert.strictEqual(result.status, "APPROVED");
  assert.strictEqual(result.checks.budget, "PASS");
});

test('Validation Agent - Rejects on Budget Exceed', (t) => {
  const plan = { recommended_transfer_qty: 100, estimated_transport_cost_inr: 600000 };
  const ctx = {
    warehouse_capacity: 500, labor_capacity: 500, transport_capacity: 200,
    resulting_store_inventory: 150, safety_stock: 50, current_store_inventory: 400,
    supplier_capacity: 1000, forecast_confidence: 0.9, is_new_or_high_value: false
  };
  const result = runValidation(plan, ctx);
  assert.strictEqual(result.status, "REJECTED");
  assert.strictEqual(result.checks.budget, "FAIL");
});

test('Validation Agent - Requires Human for Low Confidence', (t) => {
  const plan = { recommended_transfer_qty: 100, estimated_transport_cost_inr: 50000 };
  const ctx = {
    warehouse_capacity: 500, labor_capacity: 500, transport_capacity: 200,
    resulting_store_inventory: 150, safety_stock: 50, current_store_inventory: 400,
    supplier_capacity: 1000, forecast_confidence: 0.75, is_new_or_high_value: false
  };
  const result = runValidation(plan, ctx);
  assert.strictEqual(result.status, "HUMAN_APPROVAL_REQUIRED");
});

test('Validation Agent - Rejects on >30% Inventory Increase', (t) => {
  const plan = { recommended_transfer_qty: 200, estimated_transport_cost_inr: 50000 };
  const ctx = {
    warehouse_capacity: 500, labor_capacity: 500, transport_capacity: 500,
    resulting_store_inventory: 300, safety_stock: 50, current_store_inventory: 100, // 200 increase on 100 is 200%
    supplier_capacity: 1000, forecast_confidence: 0.9, is_new_or_high_value: false
  };
  const result = runValidation(plan, ctx);
  assert.strictEqual(result.status, "REJECTED");
  assert.match(result.reason, /exceeds 30% limit/);
});
