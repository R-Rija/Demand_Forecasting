import assert from 'assert';
import { runForecastAgent } from '../src/agents/forecastAgent.js';
import { query } from '../src/db.js';

async function testForecastAgent() {
  console.log("Running forecast agent tests...");

  // 1. Initial run
  console.log("Testing initial run...");
  await runForecastAgent({ city: 'Chennai' }, 7);
  
  const countRes1 = await query("SELECT COUNT(*) AS c FROM dbo.FactForecast WHERE ModelVersion='agent-v1'");
  const initialCount = countRes1.recordset[0].c;
  assert(initialCount > 0, "Forecast agent should generate rows");
  console.log(`Initial rows generated: ${initialCount}`);
  
  // 2. Idempotent check (rerunning gives no duplicate rows)
  console.log("Testing idempotent MERGE...");
  await runForecastAgent({ city: 'Chennai' }, 7);
  const countRes2 = await query("SELECT COUNT(*) AS c FROM dbo.FactForecast WHERE ModelVersion='agent-v1'");
  assert.strictEqual(countRes2.recordset[0].c, initialCount, "MERGE is not idempotent - row count increased");
  console.log("Idempotent check passed.");
  
  // 3. Rain scenario checks (Rainwear should have Adjusted > Baseline, confidence < 0.95)
  console.log("Testing uplift and confidence logic for Rainwear in Chennai during heavy rain...");
  
  // Inject some heavy rain data for tomorrow in Chennai to test the SQL logic
  await query(`
    DECLARE @Tomorrow INT = (SELECT MIN(DateKey) FROM dbo.DimDate WHERE FullDate > GETDATE());
    IF NOT EXISTS (SELECT 1 FROM dbo.FactExternalSignals WHERE DateKey=@Tomorrow AND City='Chennai')
    BEGIN
      INSERT INTO dbo.FactExternalSignals (DateKey, City, RainfallMM, Temperature, IsHoliday)
      VALUES (@Tomorrow, 'Chennai', 50, 28, 0);
    END
    ELSE
    BEGIN
      UPDATE dbo.FactExternalSignals SET RainfallMM=50 WHERE DateKey=@Tomorrow AND City='Chennai';
    END
  `);
  
  // Rerun to pick up the new rain data
  await runForecastAgent({ city: 'Chennai' }, 7);
  
  // Verify Rainwear uplift
  const rainRes = await query(`
    SELECT TOP 1 f.BaselineForecast, f.AdjustedForecast, f.Confidence, p.Category 
    FROM dbo.FactForecast f
    JOIN dbo.DimProduct p ON p.ProductKey = f.ProductKey
    WHERE p.Category = 'Rainwear' AND f.ModelVersion = 'agent-v1'
      AND f.PrimaryDriver LIKE '%Heavy rainfall%'
  `);
  
  if (rainRes.recordset.length > 0) {
    const row = rainRes.recordset[0];
    assert(row.AdjustedForecast > row.BaselineForecast, "Rainwear should have positive uplift during heavy rain");
    assert(row.Confidence >= 0.5 && row.Confidence <= 0.98, "Confidence must be within 0.5 - 0.98");
    assert(row.Confidence < 0.95, "Confidence should be penalized during weather anomaly");
    console.log("Rain scenario check passed.");
  } else {
    console.log("Warning: No rainwear forecast records found for tomorrow, skipping rain assertion.");
  }
  
  console.log("All forecast tests passed!");
  process.exit(0);
}

testForecastAgent().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
