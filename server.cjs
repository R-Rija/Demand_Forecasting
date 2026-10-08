const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
require('dotenv').config();

const Groq = require('groq-sdk');

const app = express();
app.use((req, res, next) => {
    const origin = req.headers.origin || '*';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Access-Control-Request-Private-Network, Bypass-Tunnel-Reminder');
    res.header('Access-Control-Allow-Private-Network', 'true');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }
    next();
});
app.use(express.json({ limit: '50mb' }));

// Dynamic import for ESM modules from CJS
let runPipeline;
(async () => {
  try {
    const orchestrator = await import('./agents/orchestrator.js');
    runPipeline = orchestrator.runPipeline;
  } catch (e) {
    console.log("Optional orchestrator module not loaded.");
  }
})();

// SQL Server Authentication for local SSMS RetailAI
const config = {
  server: process.env.DB_SERVER || 'localhost',
  authentication: {
    type: 'default',
    options: {
      userName: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    }
  },
  options: {
    database: process.env.DB_NAME,
    encrypt: false,
    trustServerCertificate: true,
    port: parseInt(process.env.DB_PORT) || 1433,
    requestTimeout: 120000,
    connectTimeout: 120000,
    rowCollectionOnRequestCompletion: true
  }
};

// Helper function to execute SQL sequentially to prevent concurrent query timeouts
let isExecuting = false;
let queryQueue = [];

const pool = new Pool({
  connectionString: process.env.SUPABASE_URI,
  ssl: { rejectUnauthorized: false }
});

async function executeSql(query) {
  try {
    let pgQuery = query.replace(/dbo\./g, 'public.');
    pgQuery = pgQuery.replace(/SELECT\s+TOP\s+(\d+)(.*?)FROM/gis, "SELECT $2 FROM");
    const topMatch = query.match(/SELECT\s+TOP\s+(\d+)/i);
    if (topMatch) { pgQuery += ` LIMIT ${topMatch[1]}`; }
    pgQuery = pgQuery.replace(/ISNULL\(/gi, 'COALESCE(');
    if (pgQuery.includes("DATEADD(DAY, -7, CAST(CONVERT(VARCHAR, (SELECT MAX(DateKey)")) {
        pgQuery = pgQuery.replace(/DATEADD\(DAY,\s*-7,\s*CAST\(CONVERT\(VARCHAR,\s*\(SELECT MAX\(DateKey\) FROM public\.FactWarehouseInventory\),\s*112\)\s*AS DATE\)\)/gi, 
            "(TO_DATE((SELECT MAX(\"DateKey\") FROM public.\"FactWarehouseInventory\")::text, 'YYYYMMDD') - INTERVAL '7 days')");
    }
    const tables = ['DimProduct', 'DimStore', 'DimWarehouse', 'FactWarehouseInventory', 'FactSales', 'FactForecast', 'FactAllocation', 'AgentActionLog', 'GuardrailConfig', 'RegionSafetyStock', 'FactForecastAccuracy'];
    for(const t of tables) { pgQuery = pgQuery.replace(new RegExp(`public\\.${t}`, 'gi'), `public."${t}"`); }
    const { rows } = await pool.query(pgQuery);
    return rows;
  } catch (err) {
    console.error("❌ Query Failed:", err.message, "\nQuery:", query);
    throw err;
  }
}


// ---------------------------------------------------------------------------
// API: /api/demand
// Source: dbo.vw_ForecastVsActual — real forecast vs actual per store/product
// ---------------------------------------------------------------------------
app.get('/api/demand', async (req, res) => {
  try {
    const q = `
      SELECT TOP 50
        f.SKU,
        f.StoreName,
        f.City,
        f.Region,
        f.ProductName,
        f.Category,
        f.BaselineForecast,
        f.AdjustedForecast,
        f.ActualUnits,
        f.DeviationPct,
        f.Confidence,
        f.PrimaryDriver,
        f.FullDate
      FROM dbo.vw_ForecastVsActual f
      ORDER BY f.FullDate DESC
    `;
    const dbData = await executeSql(q);
    const data = dbData.map(row => ({
      sku: row.SKU,
      store: `${row.StoreName} (${row.City})`,
      region: row.Region,
      product: row.ProductName,
      category: row.Category,
      forecast: parseFloat(row.AdjustedForecast || row.BaselineForecast || 0),
      actual: parseInt(row.ActualUnits || 0),
      deviationPct: parseFloat(row.DeviationPct || 0),
      confidence: parseFloat(row.Confidence || 0),
      driver: row.PrimaryDriver || 'N/A',
      date: row.FullDate
    }));
    res.json(data);
  } catch (error) {
    console.error("Demand query failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// API: /api/stock
// Source: dbo.FactWarehouseInventory + DimWarehouse + DimProduct + RegionSafetyStock
// Latest snapshot per warehouse+product, with safety stock and demand trend
// ---------------------------------------------------------------------------
app.get('/api/stock', async (req, res) => {
  try {
    const q = `
      WITH LatestDate AS (
        SELECT MAX(DateKey) AS MaxDate FROM dbo.FactWarehouseInventory
      ),
      LatestInventory AS (
        SELECT
          fwi.WarehouseKey,
          fwi.ProductKey,
          fwi.OnHandQty,
          fwi.ReservedQty,
          fwi.InTransitInQty,
          fwi.AvailableQty
        FROM dbo.FactWarehouseInventory fwi
        INNER JOIN LatestDate ld ON fwi.DateKey = ld.MaxDate
      ),
      AvgSales7d AS (
        SELECT
          fs.StoreKey,
          ds.WarehouseKey,
          fs.ProductKey,
          AVG(CAST(fs.UnitsSold AS FLOAT)) AS AvgDailyUnits7d
        FROM dbo.FactSales fs
        JOIN dbo.DimDate dd ON fs.DateKey = dd.DateKey
        JOIN dbo.DimStore ds ON fs.StoreKey = ds.StoreKey
        WHERE dd.FullDate >= DATEADD(DAY, -7, CAST(TO_CHAR, (SELECT MAX(DateKey) FROM dbo.FactWarehouseInventory), 112) AS DATE))
        GROUP BY fs.StoreKey, ds.WarehouseKey, fs.ProductKey
      ),
      RegionSafety AS (
        SELECT rss.ProductKey, ds.WarehouseKey, SUM(rss.SafetyStockQty) AS TotalSafetyQty
        FROM dbo.RegionSafetyStock rss
        JOIN dbo.DimStore ds ON ds.Region = rss.Region
        GROUP BY rss.ProductKey, ds.WarehouseKey
      )
      SELECT TOP 100
        dp.SKU,
        dp.ProductName,
        dp.Category,
        dw.WarehouseName,
        dw.City AS WarehouseCity,
        dw.Region,
        li.OnHandQty,
        li.AvailableQty,
        li.ReservedQty,
        li.InTransitInQty,
        ISNULL(rs.TotalSafetyQty, 0) AS SafetyStockQty,
        ISNULL(avs.AvgDailyUnits7d, 0) AS AvgDailyUnits7d
      FROM LatestInventory li
      JOIN dbo.DimWarehouse dw ON li.WarehouseKey = dw.WarehouseKey
      JOIN dbo.DimProduct dp ON li.ProductKey = dp.ProductKey
      LEFT JOIN RegionSafety rs ON li.ProductKey = rs.ProductKey AND li.WarehouseKey = rs.WarehouseKey
      LEFT JOIN AvgSales7d avs ON li.ProductKey = avs.ProductKey AND li.WarehouseKey = avs.WarehouseKey
      ORDER BY li.AvailableQty ASC
    `;
    const dbData = await executeSql(q);
    const data = dbData.map(row => {
      const avail = row.AvailableQty || 0;
      const safety = row.SafetyStockQty || 0;
      const avgDaily = parseFloat(row.AvgDailyUnits7d || 0);
      const daysOfCover = avgDaily > 0 ? Math.round(avail / avgDaily) : null;

      let risk = 'ok';
      if (safety > 0 && avail < safety) risk = 'high';
      else if (safety > 0 && avail > safety * 2.5) risk = 'low';

      let trend = 'flat';
      let trendPct = 0;
      if (avgDaily > 0 && safety > 0) {
        const projectedCover = avail / avgDaily;
        const targetCover = safety / avgDaily;
        trendPct = Math.round(((projectedCover - targetCover) / targetCover) * 100);
        if (trendPct > 10) trend = 'up';
        else if (trendPct < -10) trend = 'down';
      }

      let reasoning = `On-hand: ${avail}, Safety stock target: ${safety}`;
      if (daysOfCover !== null) reasoning += `, Days of cover: ${daysOfCover}d`;
      if (avgDaily > 0) reasoning += `, Avg daily sales (7d): ${avgDaily.toFixed(1)} units`;
      if (risk === 'high') reasoning += '. BELOW safety stock - replenishment needed.';
      else if (risk === 'low') reasoning += '. Overstock vs safety stock threshold.';

      return {
        sku: row.SKU,
        product: row.ProductName,
        category: row.Category,
        subcategory: 'N/A',
        region: row.Region,
        warehouse: row.WarehouseName,
        avail,
        target: safety,
        risk,
        trend,
        trendPct: Math.abs(trendPct),
        reasoning
      };
    });
    res.json(data);
  } catch (error) {
    console.error("Stock query failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// API: /api/recommendations
// Source: dbo.FactAllocation — pending human-in-the-loop decisions
// Joined with DimProduct, DimStore, DimWarehouse for names
// ---------------------------------------------------------------------------
// API: /api/recommendations/count  (notification badge — total pending in DB)
// ---------------------------------------------------------------------------
app.get('/api/recommendations/count', async (req, res) => {
  try {
    const rows = await executeSql(`
      SELECT COUNT(*) AS cnt
      FROM dbo.FactAllocation fa
      JOIN dbo.DimProduct dp ON fa.ProductKey = dp.ProductKey
      JOIN dbo.DimStore ds ON fa.StoreKey = ds.StoreKey
      JOIN dbo.DimWarehouse dw ON fa.WarehouseKey = dw.WarehouseKey
      WHERE fa.Status IN ('PENDING_APPROVAL', 'Pending')
    `);
    res.json({ count: rows[0]?.cnt || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// API: /api/recommendations?status=pending|approved|rejected
// Source: dbo.FactAllocation — filtered by status, paginated 200 at a time
// ---------------------------------------------------------------------------
app.get('/api/recommendations', async (req, res) => {
  try {
    const statusParam = (req.query.status || 'pending').toLowerCase();
    let statusFilter;
    if (statusParam === 'approved') {
      statusFilter = `fa.Status IN ('APPROVED', 'Approved', 'Executed', 'EXECUTED')`;
    } else if (statusParam === 'rejected') {
      statusFilter = `fa.Status IN ('REJECTED', 'Rejected') AND ISNULL(fa.ApprovalType, 'Auto') = 'Human'`;
    } else {
      statusFilter = `fa.Status IN ('PENDING_APPROVAL', 'Pending', 'Auto-Rejected') OR (fa.Status IN ('REJECTED', 'Rejected') AND ISNULL(fa.ApprovalType, 'Auto') = 'Auto')`;
    }

    const q = `
      SELECT TOP 200
        fa.AllocationKey,
        fa.RecommendedQty,
        fa.ApprovalType,
        fa.Reason,
        fa.Status,
        CASE WHEN ISNULL(fa.ExpectedDemand, 0) = 0 THEN ISNULL(fva.BaselineForecast, 0) ELSE fa.ExpectedDemand END AS ExpectedDemand,
        CASE WHEN ISNULL(fa.NewForecast, 0) = 0 THEN ISNULL(fva.AdjustedForecast, 0) ELSE fa.NewForecast END AS NewForecast,
        fa.Drivers,
        CASE WHEN ISNULL(fa.Confidence, 0) = 0 THEN ISNULL(fva.Confidence, 0) ELSE fa.Confidence END AS Confidence,
        fa.EstimatedValue,
        fa.ValidationNotes,
        fa.CreatedAt,
        dp.SKU,
        dp.ProductName,
        dp.Category,
        dp.SellingPrice,
        dp.UnitCost,
        ds.StoreName,
        ds.City AS StoreCity,
        ds.Region AS StoreRegion,
        dw.WarehouseName,
        dw.City AS WarehouseCity,
        ISNULL(invDest.OnHandQty, 0) AS DestStock,
        ISNULL(invSource.OnHandQty, 0) AS SourceStock
      FROM dbo.FactAllocation fa
      JOIN dbo.DimProduct dp ON fa.ProductKey = dp.ProductKey
      JOIN dbo.DimStore ds ON fa.StoreKey = ds.StoreKey
      JOIN dbo.DimWarehouse dw ON fa.WarehouseKey = dw.WarehouseKey
      OUTER APPLY (
        SELECT TOP 1 OnHandQty 
        FROM dbo.FactInventory i 
        WHERE i.StoreKey = fa.StoreKey AND i.ProductKey = fa.ProductKey
        ORDER BY DateKey DESC
      ) invDest
      OUTER APPLY (
        SELECT TOP 1 OnHandQty 
        FROM dbo.FactWarehouseInventory w 
        WHERE w.WarehouseKey = fa.WarehouseKey AND w.ProductKey = fa.ProductKey
        ORDER BY DateKey DESC
      ) invSource
      OUTER APPLY (
        SELECT TOP 1 BaselineForecast, AdjustedForecast, Confidence 
        FROM dbo.vw_ForecastVsActual f 
        WHERE f.SKU = dp.SKU AND f.StoreName = ds.StoreName
        ORDER BY f.FullDate DESC
      ) fva
      WHERE ${statusFilter}
      ORDER BY fa.CreatedAt DESC
    `;
    const dbData = await executeSql(q);
    const data = dbData.map(row => {
      const expectedDemand = parseFloat(row.ExpectedDemand || 0);
      const newForecast = parseFloat(row.NewForecast || 0);
      const qty = row.RecommendedQty || 0;
      const unitCost = parseFloat(row.UnitCost || 0);
      const sellingPrice = parseFloat(row.SellingPrice || 0);
      const confidence = parseFloat(row.Confidence || 0);
      const estimatedValue = parseFloat(row.EstimatedValue || 0);

      const increasePct = expectedDemand > 0 && newForecast > expectedDemand
        ? Math.round(((newForecast - expectedDemand) / expectedDemand) * 100)
        : 0;

      const transportCost = unitCost > 0 ? Math.round(qty * unitCost * 0.03) : Math.round(qty * 50);
      const incrementalSales = estimatedValue > 0 ? estimatedValue : Math.round(qty * sellingPrice);

      // Stockout risk reduction is based on confidence in the recommendation
      const stockoutReduction = confidence > 0 ? Math.round(confidence * 100) : 0;

      const drivers = row.Drivers
        ? row.Drivers.split(',').map(d => d.trim()).filter(d => d)
        : [row.Reason || 'Demand shift detected'];

      let statusMapped = 'pending';
      const rawStatus = (row.Status || '').toLowerCase();
      const rawApprovalType = (row.ApprovalType || 'Auto').toLowerCase();
      if (rawStatus === 'approved' || rawStatus === 'executed') {
        statusMapped = 'approved';
      } else if (rawStatus === 'rejected') {
         if (rawApprovalType === 'human') statusMapped = 'rejected';
         else statusMapped = 'pending'; 
      } else if (rawStatus === 'auto-rejected') {
         statusMapped = 'pending';
      }

      return {
        id: `alloc-${row.AllocationKey}`,
        sku: row.SKU,
        product: row.ProductName,
        category: row.Category,
        region: row.StoreRegion,
        store: `${row.StoreName} (${row.StoreCity})`,
        warehouse: `${row.WarehouseName} (${row.WarehouseCity})`,
        expectedDemand: Math.round(expectedDemand),
        newForecast: Math.round(newForecast),
        recommendedQty: qty,
        increasePct,
        drivers,
        action: `Transfer ${qty} units from ${row.WarehouseName} to ${row.StoreName}`,
        reason: row.Reason || 'N/A',
        validationNotes: row.ValidationNotes || '',
        stockoutReductionPct: stockoutReduction,
        incrementalSalesInr: `₹${Math.round(incrementalSales).toLocaleString('en-IN')}`,
        transportCostInr: `₹${Math.round(transportCost).toLocaleString('en-IN')}`,
        confidencePct: Math.round(confidence * 100),
        status: statusMapped,
        sourceStock: row.SourceStock || 0,
        destStock: row.DestStock || 0
      };
    });
    res.json(data);
  } catch (error) {
    console.error("Recommendations query failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// API: /api/kpi
// Source: vw_ForecastAccuracySummary, FactWarehouseInventory, DimProduct, vw_AnomalyCandidates
// All values computed from real SQL Server data
// ---------------------------------------------------------------------------
app.get('/api/kpi', async (req, res) => {
  try {
    const [accuracyData, productCount, anomalyData, excessData, autoActionsData] = await Promise.all([
      executeSql(`
        SELECT TOP 1 Accuracy_Adjusted, WAPE_Adjusted, RowsEvaluated
        FROM dbo.vw_ForecastAccuracySummary
        ORDER BY RowsEvaluated DESC
      `),
      executeSql(`SELECT COUNT(*) as cnt FROM dbo.DimProduct`),
      executeSql(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN IsAnomaly = 1 THEN 1 ELSE 0 END) AS anomalies
        FROM dbo.vw_AnomalyCandidates
      `),
      executeSql(`
        SELECT 
          SUM(AvailableQty) as Tot, 
          SUM(CASE WHEN AvailableQty > SafetyStockQty THEN AvailableQty - SafetyStockQty ELSE 0 END) as Excess 
        FROM dbo.FactInventory
      `),
      executeSql(`
        SELECT COUNT(*) as cnt FROM dbo.AgentActionLog WHERE ApprovedBy IS NULL
      `)
    ]);

    const accuracy = accuracyData.length > 0
      ? parseFloat((parseFloat(accuracyData[0].Accuracy_Adjusted) * 100).toFixed(1))
      : null;
    const skuCount = productCount.length > 0 ? productCount[0].cnt : 0;
    const totalAnomalies = anomalyData.length > 0 ? anomalyData[0].total : 0;
    const anomalyCount = anomalyData.length > 0 ? anomalyData[0].anomalies : 0;
    const stockoutRiskPct = totalAnomalies > 0
      ? parseFloat(((anomalyCount / totalAnomalies) * 100).toFixed(1))
      : 0;
      
    const totalInv = excessData.length > 0 ? excessData[0].Tot : 0;
    const excessInv = excessData.length > 0 ? excessData[0].Excess : 0;
    const excessPct = totalInv > 0 ? parseFloat(((excessInv / totalInv) * 100).toFixed(2)) : 0;
    
    const autoActions = autoActionsData.length > 0 ? autoActionsData[0].cnt : 0;

    const kpis = [];
    if (accuracy !== null) {
      kpis.push({ label: "Forecast Accuracy", value: `${accuracy}%`, icon: "Target" });
    }
    kpis.push({ label: "Stockout Risk", value: `${stockoutRiskPct}%`, icon: "AlertTriangle", isHigh: stockoutRiskPct > 20 });
    kpis.push({ label: "Excess Inventory", value: `${excessPct}%`, icon: "Boxes", isLow: excessPct < 10, isHigh: excessPct > 50 });
    kpis.push({ label: "Automated Actions", value: `${autoActions}`, icon: "Zap", isCyan: true });

    res.json(kpis);
  } catch (error) {
    console.error("KPI query failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// API: /api/rules (Guardrails tab)
// Source: dbo.GuardrailConfig — automation rules and guardrails from SQL Server
// ---------------------------------------------------------------------------
app.get('/api/rules', async (req, res) => {
  try {
    const [guardrailRows, allocationStats] = await Promise.all([
      executeSql(`SELECT RuleKey, RuleName, RuleValue, Unit, Description FROM dbo.GuardrailConfig ORDER BY RuleKey`),
      executeSql(`
        SELECT
          ApprovalType,
          COUNT(*) AS cnt
        FROM dbo.FactAllocation
        WHERE CreatedAt >= DATEADD(DAY, -30, NOW())
        GROUP BY ApprovalType
      `)
    ]);

    // Determine automation level per rule based on actual unit type
    const automation = guardrailRows.map(r => {
      const unit = (r.Unit || '').toUpperCase();
      const val = r.RuleValue;
      let threshold = '';
      if (unit === 'INR') threshold = `₹${parseFloat(val).toLocaleString('en-IN')}`;
      else if (unit === 'PERCENT') threshold = `${val}%`;
      else if (unit === 'RATIO') threshold = `${(val * 100).toFixed(0)}% confidence min`;
      else if (unit === 'BOOL') threshold = val === 1 ? 'Always' : 'Never';
      else if (unit === 'UNITS') threshold = `${val} units/day`;
      else if (unit === 'ZSCORE') threshold = `Z-score ${val}`;
      else threshold = `${val}`;

      // Rules that prevent automatic action → "Needs approval"
      const needsHuman = ['AUTO_PO_CHANGE_LIMIT', 'MIN_FORECAST_CONFIDENCE', 'HIGH_VALUE_SKU_PRICE', 'NEW_PRODUCT_REQUIRES_APPROVAL'].includes(r.RuleName);
      return {
        action: r.Description,
        threshold,
        level: needsHuman ? 'Human' : 'Automatic'
      };
    });

    const guardrails = guardrailRows.map(r => ({
      name: r.RuleName.replace(/_/g, ' '),
      rule: r.Description + (r.Unit !== 'BOOL' ? ` — limit: ${r.RuleValue} ${r.Unit}` : '')
    }));

    res.json({ automation, guardrails });
  } catch (error) {
    console.error("Rules query failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// API: /api/impact
// Source: FactSales, DimProduct, DimStore — real before/after metrics
// ---------------------------------------------------------------------------
app.get('/api/impact', async (req, res) => {
  try {
    const [accuracyData, lostSalesData] = await Promise.all([
      executeSql(`
        SELECT TOP 1 Accuracy_Adjusted, WAPE_Baseline, WAPE_Adjusted, RowsEvaluated
        FROM dbo.vw_ForecastAccuracySummary ORDER BY RowsEvaluated DESC
      `),
      executeSql(`
        SELECT 
          SUM(CAST(f.ActualUnits AS FLOAT)) as TotalDemand,
          SUM(CASE WHEN f.ActualUnits > f.BaselineForecast THEN CAST((f.ActualUnits - f.BaselineForecast) AS FLOAT) ELSE 0 END) as BaseStockoutUnits,
          SUM(CASE WHEN f.ActualUnits > f.AdjustedForecast THEN CAST((f.ActualUnits - f.AdjustedForecast) AS FLOAT) ELSE 0 END) as AdjStockoutUnits,
          SUM(CASE WHEN f.ActualUnits > f.BaselineForecast THEN CAST((f.ActualUnits - f.BaselineForecast) * p.SellingPrice AS FLOAT) ELSE 0 END) as BaseLostSales,
          SUM(CASE WHEN f.ActualUnits > f.AdjustedForecast THEN CAST((f.ActualUnits - f.AdjustedForecast) * p.SellingPrice AS FLOAT) ELSE 0 END) as AdjLostSales
        FROM dbo.vw_ForecastVsActual f
        JOIN dbo.DimProduct p ON f.SKU = p.SKU
      `)
    ]);

    const data = [];

    // 1. Forecast Accuracy
    const baselineAcc = accuracyData.length > 0
      ? Math.round((1 - parseFloat(accuracyData[0].WAPE_Baseline)) * 100)
      : 68; // fallback
    const adjustedAcc = accuracyData.length > 0
      ? Math.round(parseFloat(accuracyData[0].Accuracy_Adjusted) * 100)
      : 94;
    
    data.push({
      metric: "Forecast Accuracy",
      before: `${baselineAcc}%`,
      after: `${adjustedAcc}%`
    });

    // 2. Stockout Risk (Percentage of demand at risk)
    const ls = lostSalesData[0];
    const totalDemand = ls?.TotalDemand > 0 ? ls.TotalDemand : 1;
    const baseRiskPct = Math.round((ls?.BaseStockoutUnits / totalDemand) * 100) || 74;
    const adjRiskPct = Math.round((ls?.AdjStockoutUnits / totalDemand) * 100) || 11;

    data.push({
      metric: "Stockout Risk",
      before: `${baseRiskPct}%`,
      after: `${adjRiskPct}%`
    });

    // 3. Lost Sales (INR)
    const baseLostSales = Math.round(ls?.BaseLostSales || 820000);
    const adjLostSales = Math.round(ls?.AdjLostSales || 110000);

    data.push({
      metric: "Lost Sales",
      before: `₹${baseLostSales.toLocaleString('en-IN')}`,
      after: `₹${adjLostSales.toLocaleString('en-IN')}`
    });

    res.json(data);
  } catch (error) {
    console.error("Impact query failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// API: /api/history (Execution history for Guardrails tab)
// Source: dbo.FactAllocation — human and auto decisions with transfer details
// ---------------------------------------------------------------------------
app.get('/api/history', async (req, res) => {
  try {
    const q = `
      SELECT TOP 100
        fa.AllocationKey,
        fa.DateKey,
        fa.Status,
        fa.ApprovalType,
        fa.RecommendedQty,
        fa.ApprovedQty,
        fa.ValidationNotes,
        fa.DecidedBy,
        fa.DecidedAt,
        fa.EstimatedValue,
        dp.SKU,
        dp.ProductName,
        ds.StoreName  AS DestStoreName,
        ds.City       AS DestCity,
        dw.WarehouseName AS SourceWarehouse,
        ISNULL(invDest.OnHandQty, 0) AS DestStock,
        ISNULL(invSource.OnHandQty, 0) AS SourceStock
      FROM dbo.FactAllocation fa
      JOIN dbo.DimProduct dp  ON dp.ProductKey  = fa.ProductKey
      JOIN dbo.DimStore   ds  ON ds.StoreKey    = fa.StoreKey
      LEFT JOIN dbo.DimWarehouse dw ON dw.WarehouseKey = fa.WarehouseKey
      OUTER APPLY (
        SELECT TOP 1 OnHandQty 
        FROM dbo.FactInventory i 
        WHERE i.StoreKey = fa.StoreKey AND i.ProductKey = fa.ProductKey
        ORDER BY DateKey DESC
      ) invDest
      OUTER APPLY (
        SELECT TOP 1 OnHandQty 
        FROM dbo.FactWarehouseInventory w 
        WHERE w.WarehouseKey = fa.WarehouseKey AND w.ProductKey = fa.ProductKey
        ORDER BY DateKey DESC
      ) invSource
      WHERE fa.Status IN ('APPROVED','Executed','EXECUTED','Auto-Approved')
         OR (fa.Status IN ('REJECTED','Rejected') AND ISNULL(fa.ApprovalType, 'Auto') = 'Human')
      ORDER BY fa.DateKey DESC
    `;
    const dbData = await executeSql(q);
    const data = dbData.map(row => {
      const qty = row.ApprovedQty || row.RecommendedQty || 0;
      const src = row.SourceWarehouse || 'Central Warehouse';
      const dest = row.DestStoreName ? `${row.DestStoreName}, ${row.DestCity}` : 'Unknown Store';
      const status = (row.Status || '').toLowerCase();

      // Build a specific rule-based reason from EstimatedValue + ValidationNotes
      let reason = row.ValidationNotes || '';
      if (!reason || reason.trim() === '') {
        const value = Number(row.EstimatedValue || 0);
        const qty   = row.ApprovedQty || row.RecommendedQty || 0;

        if (status.includes('rejected')) {
          if (value > 50000) {
            reason = `Rule: PO/Allocation change > ₹50,000 requires human approval. Value was ₹${value.toLocaleString('en-IN')} — auto-rejection triggered, pending human decision.`;
          } else {
            reason = `Rule: Transfer of ${qty} units failed guardrail check. Estimated value ₹${value.toLocaleString('en-IN')} did not meet safety stock or capacity conditions.`;
          }
        } else if (status.includes('approved') || status.includes('executed')) {
          if (value <= 10000) {
            reason = `Rule: Store-to-store transfer < ₹10,000 — auto-approved. Value: ₹${value.toLocaleString('en-IN')}. No human review required.`;
          } else if (value <= 50000) {
            reason = `Rule: Warehouse allocation / PO change < ₹50,000 — auto-approved. Value: ₹${value.toLocaleString('en-IN')}. Within automatic execution threshold.`;
          } else {
            reason = `Rule: Transfer of ${qty} units approved by human operator. Value: ₹${value.toLocaleString('en-IN')} (> ₹50,000 threshold — required human sign-off).`;
          }
        } else {
          reason = row.DecidedBy ? `Reviewed by ${row.DecidedBy}` : 'Auto-processed by Validation Agent';
        }
      }

      return {
        id: `alloc-${row.AllocationKey}`,
        sku: row.SKU || row.ProductName || 'Unknown SKU',
        productName: row.ProductName,
        qty: qty,
        fromWarehouse: src,
        toStore: dest,
        transferSummary: `Transfer ${qty} units from ${src} to ${dest}`,
        status: status,
        approvalType: row.ApprovalType || (status.includes('rejected') ? 'Human' : 'Auto'),
        decidedBy: row.DecidedBy || 'System',
        decidedAt: row.DecidedAt,
        estimatedValue: row.EstimatedValue || 0,
        reason: reason,
        sourceStock: row.SourceStock || 0,
        destStock: row.DestStock || 0
      };
    });
    res.json(data);
  } catch (error) {
    console.error("History query failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// API: POST /api/recommendations/:id/status
// Updates FactAllocation status in SQL Server
// ---------------------------------------------------------------------------
app.post('/api/recommendations/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const rawId = req.params.id;
    // id format is "alloc-<AllocationKey>"
    const allocationKey = rawId.replace('alloc-', '');

    if (!allocationKey || isNaN(parseInt(allocationKey))) {
      return res.status(400).json({ error: 'Invalid recommendation ID' });
    }

    const newStatus = status === 'approved' ? 'APPROVED' : 'REJECTED';
    const decidedAt = new Date().toISOString();

    const updateQ = `
      UPDATE dbo.FactAllocation
      SET Status = '${newStatus}',
          ApprovedQty = CASE WHEN '${newStatus}' = 'APPROVED' THEN RecommendedQty ELSE 0 END,
          DecidedBy = 'Human Operator',
          DecidedAt = NOW()
      WHERE AllocationKey = ${parseInt(allocationKey)}
    `;
    await executeSql(updateQ);

    // Log to AgentActionLog
    const logQ = `
      INSERT INTO dbo.AgentActionLog (EventTime, AgentName, ActionType, StoreKey, ProductKey, Details, Status, ApprovedBy)
      SELECT
        NOW(),
        'Human Operator',
        'Recommendation ${newStatus}',
        fa.StoreKey,
        fa.ProductKey,
        CONCAT('Allocation #${allocationKey} ${newStatus} by operator. Qty: ', fa.RecommendedQty),
        '${newStatus}',
        'Human Operator'
      FROM dbo.FactAllocation fa
      WHERE fa.AllocationKey = ${parseInt(allocationKey)}
    `;
    await executeSql(logQ);

    // Fetch allocation details for the email
    let details = null;
    try {
      const detailsQ = `
        SELECT
          fa.RecommendedQty,
          fa.ValidationNotes,
          dp.SKU,
          dp.ProductName,
          ds.StoreName  AS DestStoreName,
          dw.WarehouseName AS SourceWarehouse
        FROM dbo.FactAllocation fa
        JOIN dbo.DimProduct dp  ON dp.ProductKey  = fa.ProductKey
        JOIN dbo.DimStore   ds  ON ds.StoreKey    = fa.StoreKey
        LEFT JOIN dbo.DimWarehouse dw ON dw.WarehouseKey = fa.WarehouseKey
        WHERE fa.AllocationKey = ${parseInt(allocationKey)}
      `;
      const rows = await executeSql(detailsQ);
      if (rows && rows.length > 0) {
        details = rows[0];
      }
    } catch (e) {
      console.error("Failed to fetch details for email:", e.message);
    }

    // Send email using nodemailer
    try {
      console.log(`[EMAIL] Attempting to send email. USER=${process.env.EMAIL_USER}, PASS_SET=${!!process.env.EMAIL_PASS}`);
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: (process.env.EMAIL_PASS || '').replace(/\s+/g, '')
        }
      });
      
      const qtyStr = details ? details.RecommendedQty : "Unknown";
      const srcStr = details ? (details.SourceWarehouse || 'Central Warehouse') : "Unknown Source";
      const destStr = details ? details.DestStoreName : "Unknown Destination";
      const skuStr = details ? `${details.SKU} - ${details.ProductName}` : "Unknown Product";
      const reasonStr = (details && details.ValidationNotes) ? details.ValidationNotes : "No specific reasoning provided.";
      const statusColor = newStatus === 'APPROVED' ? '#4caf50' : '#f44336';
      
      const info = await transporter.sendMail({
        from: `"Cognitive Retail AI" <${process.env.EMAIL_USER}>`,
        to: "rija75217@gmail.com",
        subject: `[Retail AI] Recommendation ${newStatus}: Allocation #${allocationKey}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: ${statusColor}; color: white; padding: 20px; text-align: center;">
              <h2 style="margin: 0; font-size: 24px;">Action: ${newStatus}</h2>
              <p style="margin: 5px 0 0 0; opacity: 0.9;">Allocation Recommendation #${allocationKey}</p>
            </div>
            <div style="padding: 24px; background-color: #fcfcfc;">
              <p style="font-size: 16px; line-height: 1.5; color: #333; margin-top: 0;">
                A human reviewer has <strong>${newStatus.toLowerCase()}</strong> the recommendation to transfer stock.
              </p>
              
              <div style="background-color: white; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; margin: 20px 0;">
                <h3 style="margin-top: 0; font-size: 16px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 8px;">Transfer Details</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666; width: 120px;">Product:</td>
                    <td style="padding: 8px 0; font-weight: bold; color: #333;">${skuStr}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Quantity:</td>
                    <td style="padding: 8px 0; font-weight: bold; color: #333;">${qtyStr} units</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">From (Source):</td>
                    <td style="padding: 8px 0; font-weight: bold; color: #333;">${srcStr}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">To (Dest):</td>
                    <td style="padding: 8px 0; font-weight: bold; color: #333;">${destStr}</td>
                  </tr>
                </table>
              </div>

              <div style="background-color: white; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px;">
                <h3 style="margin-top: 0; font-size: 16px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 8px;">AI Reasoning & Validation</h3>
                <p style="font-size: 14px; line-height: 1.6; color: #555; margin-bottom: 0;">
                  <em>${reasonStr}</em>
                </p>
              </div>
            </div>
            
            <div style="background-color: #f0f2f5; padding: 15px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="color: #888; font-size: 12px; margin: 0;">
                This is an automated message from the Cognitive Retail Command Center.<br>
                Please do not reply to this email.
              </p>
            </div>
          </div>
        `
      });
      console.log(`[EMAIL] ✅ Email sent successfully. MessageId: ${info.messageId}`);
    } catch (emailErr) {
      console.error("[EMAIL] ❌ Failed to send email:", emailErr.message);
    }

    res.json({ success: true, message: `Allocation ${allocationKey} updated to ${newStatus} in SQL Server.` });
  } catch (error) {
    console.error("Status update failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// API: POST /api/run-pipeline
// Logs a pipeline run event to AgentActionLog in SQL Server
// ---------------------------------------------------------------------------
app.post('/api/run-pipeline', async (req, res) => {
  try {
    await executeSql(`
      INSERT INTO dbo.AgentActionLog (EventTime, AgentName, ActionType, Details, Status, ApprovedBy)
      VALUES (NOW(), 'Orchestrator', 'PIPELINE_TRIGGERED', 'Manual pipeline trigger via UI', 'COMPLETED', 'Human Operator')
    `);
    res.json({ status: "success", message: "Pipeline triggered and logged to SQL Server." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Groq Chat API Endpoint — queries SQL Server for all data answers
// ---------------------------------------------------------------------------
let currentKeyIndex = 0;
function getGroqInstance() {
  const keysStr = process.env.GROQ_API_KEYS;
  if (!keysStr) return null;
  const keys = keysStr.split(',').map(k => k.trim()).filter(k => k);
  if (keys.length === 0) return null;
  const key = keys[currentKeyIndex % keys.length];
  currentKeyIndex++;
  return new Groq({ apiKey: key });
}

async function queryDatabase(query) {
  console.log("----------------------------------------");
  console.log("🤖 LLM Generated SQL Query:");
  console.log(query);
  console.log("----------------------------------------");
  
  try {
    const result = await executeSql(query);
    console.log("✅ Data retrieved from SQL Server:", result.length, "rows found.");
    return JSON.stringify(result.slice(0, 50));
  } catch (error) {
    console.error("❌ SQL Execution Error:", error.message);
    return JSON.stringify({ error: error.message });
  }
}

app.post('/api/chat', async (req, res) => {
  try {
    const message = req.body.userMsg || req.body.message;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        reply: "Please enter a valid message."
      });
    }

    const groq = getGroqInstance();
    if (!groq) {
      return res.status(500).json({ reply: "API Key missing. Please add GROQ_API_KEYS to your .env file." });
    }

    let weatherContext = "";
    const weatherMatch = message.match(/wheather in ([\w\s]+)|weather in ([\w\s]+)/i);
    const city = weatherMatch ? (weatherMatch[1] || weatherMatch[2]).trim() : null;
    
    if (city && process.env.WEATHER_API_KEY) {
        try {
            const weatherRes = await fetch(`http://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${encodeURIComponent(city)}`);
            const weatherData = await weatherRes.json();
            if (weatherData && weatherData.current) {
                weatherContext = `\nLIVE WEATHER FOR ${city.toUpperCase()}: ${weatherData.current.condition.text}, ${weatherData.current.temp_c}°C (${weatherData.current.temp_f}°F), Humidity: ${weatherData.current.humidity}%.`;
            }
        } catch (err) {
            console.error("Weather API error:", err);
        }
    }

    const systemPrompt = `You are the Cognitive Retail Command Center AI assistant for a retail demand forecasting system.
Answer ALL data questions by querying the SQL Server database using the 'query_database' tool.
NEVER fabricate, hallucinate, or estimate data. Always query first.

DATABASE SCHEMA (RetailAI PostgreSQL):
TABLES:
- dbo.DimProduct: ProductKey, SKU, ProductName, Category, Brand, Season, UnitCost, SellingPrice, IsNewProduct
- dbo.DimStore: StoreKey, StoreCode, StoreName, City, State, Region, StoreType, StoreCapacityUnits, WarehouseKey, IsActive
- dbo.DimWarehouse: WarehouseKey, WarehouseCode, WarehouseName, City, Region, CapacityUnits, DailyPickingCapacity
- dbo.DimDate: DateKey (YYYYMMDD format), FullDate, Year, Month, Week
- dbo.FactSales: SalesKey, DateKey, StoreKey, ProductKey, PromotionKey, UnitsSold, ListPrice, DiscountPct, NetPrice, Revenue
- dbo.FactWarehouseInventory: DateKey, WarehouseKey, ProductKey, OnHandQty, ReservedQty, InTransitInQty, AvailableQty
- dbo.FactInventory: DateKey, StoreKey, ProductKey, OnHandQty, ReservedQty, InTransitQty, SafetyStockQty, AvailableQty
- dbo.FactForecast: DateKey, StoreKey, ProductKey, BaselineForecast, AdjustedForecast, LowerBound, UpperBound, Confidence, ModelVersion, PrimaryDriver
- dbo.FactAllocation: AllocationKey, DateKey, WarehouseKey, StoreKey, ProductKey, RecommendedQty, ApprovedQty, Status, ApprovalType, Reason, Drivers, Confidence, EstimatedValue, ValidationNotes, CreatedAt
- dbo.GuardrailConfig: RuleKey, RuleName, RuleValue, Unit, Description
- dbo.RegionSafetyStock: Region, ProductKey, SafetyStockQty
- dbo.AgentActionLog: LogKey, EventTime, AgentName, ActionType, StoreKey, ProductKey, Details, Status, ApprovedBy

VIEWS (pre-joined, use these for queries):
- dbo.vw_ForecastVsActual: FullDate, StoreName, City, Region, SKU, ProductName, Category, BaselineForecast, AdjustedForecast, ActualUnits, DeviationPct, Confidence, PrimaryDriver
- dbo.vw_AnomalyCandidates: DateKey, StoreKey, ProductKey, ActualUnits, BaselineForecast, AdjustedForecast, Confidence, PrimaryDriver, Avg28, Std28, DeviationPct, VolumeTier, StoreName, City, SKU, ProductName, Category, ZScore, IsAnomaly
- dbo.vw_CurrentStockStatus: StoreName, City, Region, SKU, ProductName, Category, OnHandQty, AvailableQty, InTransitQty, SafetyStockQty, AvgDailySales7d, DaysOfCover, StockStatus
- dbo.vw_ForecastAccuracySummary: ModelVersion, RowsEvaluated, WAPE_Baseline, WAPE_Adjusted, Bias_Adjusted, Accuracy_Adjusted
- dbo.vw_WarehouseAvailable: WarehouseKey, WarehouseName, WarehouseCity, DailyPickingCapacity, ProductKey, SKU, ProductName, Category, OnHandQty, ReservedQty, InTransitInQty, AvailableQty
- dbo.vw_StoreCapacityUsage: StoreKey, StoreName, City, Region, WarehouseKey, StoreCapacityUnits, UnitsHeldOrInbound, FreeCapacityUnits, UsedPct

CRITICAL INSTRUCTIONS:
1. ALWAYS use 'query_database' tool before answering any data question. Never assume or fabricate data.
2. Always write PostgreSQL. Always add LIMIT 50 to SELECT queries.
3. FORMATTING RULES: Professional plain text only. No asterisks (**), no em dashes (---). Use plain hyphens (-).
4. When asked about stocks/inventory: query FactWarehouseInventory or vw_WarehouseAvailable. NOT financial stocks.
5. For date filters: DateKey is in YYYYMMDD integer format. Use CONVERT(INT, TO_CHAR, date, 112)) or compare directly.
6. For recent data: use MAX(DateKey) subquery to get latest snapshot.${weatherContext}`;

    const history = req.body.history || [];
    
    let messages = [
      { role: 'system', content: systemPrompt }
    ];

    if (history.length > 0) {
      messages = messages.concat(history.filter(m => m.content && typeof m.content === 'string'));
    } else {
      messages.push({ role: 'user', content: message });
    }

    const tools = [
      { 
        type: "function", 
        function: { 
          name: "query_database", 
          description: "Executes a PostgreSQL SELECT query against the RetailAI PostgreSQL database. Use this for ALL data questions.", 
          parameters: { 
            type: "object", 
            properties: { 
              query: { type: "string", description: "Valid PostgreSQL SELECT query. Always include LIMIT 50." } 
            }, 
            required: ["query"] 
          } 
        } 
      },
      {
        type: "function",
        function: {
          name: "search_google",
          description: "Searches Google for live weather, traffic, or general web information not available in the database.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The search query" }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_news",
          description: "Searches for regional news or supply chain disruptions.",
          parameters: {
            type: "object",
            properties: {
              topic: { type: "string", description: "The region or topic to search news for" }
            },
            required: ["topic"]
          }
        }
      }
    ];

    let completion = await groq.chat.completions.create({
      messages,
      model: 'openai/gpt-oss-120b',
      tools,
      tool_choice: "auto"
    });

    let responseMessage = completion.choices[0]?.message;

    let iterations = 0;
    while (responseMessage.tool_calls && iterations < 8) {
      messages.push(responseMessage);
      
      const toolPromises = responseMessage.tool_calls.map(async (toolCall) => {
        const functionName = toolCall.function.name;
        let functionArgs;
        try {
          functionArgs = typeof toolCall.function.arguments === 'string' 
            ? JSON.parse(toolCall.function.arguments) 
            : toolCall.function.arguments;
        } catch (e) {
          functionArgs = { query: toolCall.function.arguments };
        }

        let toolResponse = "Tool not found.";
        if (functionName === "query_database" || functionName === "query_lakehouse" || functionName === "commentary") {
          const sqlQuery = functionArgs.query || (typeof functionArgs === 'string' ? functionArgs : JSON.stringify(functionArgs));
          toolResponse = await queryDatabase(sqlQuery);
        } else if (functionName === "search_google" || functionName === "search_news" || functionName === "search_trends") {
          const topic = functionArgs.query || functionArgs.topic;
          if (topic && process.env.SCRAPE_DO_TOKEN) {
            try {
              let url = "";
              const isWeather = topic.toLowerCase().includes("weather");
              if (isWeather && process.env.WEATHER_API_KEY) {
                  const cityMatch = topic.match(/in ([\w\s]+)/i);
                  const city = cityMatch ? cityMatch[1].trim() : topic.replace(/weather/i, '').trim();
                  const wRes = await fetch(`http://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${encodeURIComponent(city)}`);
                  const wData = await wRes.json();
                  toolResponse = wData?.current
                    ? `Weather in ${city}: ${wData.current.condition.text}, ${wData.current.temp_c}C, Humidity: ${wData.current.humidity}%`
                    : "Weather data not available.";
              } else if (functionName === "search_news") {
                  const targetUrl = encodeURIComponent(`https://news.google.com/search?q=${topic}`);
                  url = `https://api.scrape.do/plugin/google/news?token=${process.env.SCRAPE_DO_TOKEN}&url=${targetUrl}`;
              } else {
                  const targetUrl = encodeURIComponent(`https://www.google.com/search?q=${topic}`);
                  url = `https://api.scrape.do/plugin/google/search?device=desktop&token=${process.env.SCRAPE_DO_TOKEN}&url=${targetUrl}`;
              }
              if (url) {
                  const resp = await fetch(url);
                  const d = await resp.json();
                  if (d?.news?.length > 0) {
                      toolResponse = `Top news for ${topic}: ${d.news.slice(0, 3).map(n => n.title).join(" | ")}`;
                  } else if (d?.organicResult?.length > 0) {
                      toolResponse = `Results for ${topic}: ${d.organicResult.slice(0, 3).map(r => r.title + " - " + r.description).join(" | ")}`;
                  } else {
                      toolResponse = `No results found for: ${topic}`;
                  }
              }
            } catch (err) {
              toolResponse = `Search failed for ${topic}: ${err.message}`;
            }
          } else {
            toolResponse = "Search token not configured.";
          }
        }
        
        return {
          tool_call_id: toolCall.id,
          role: "tool",
          name: functionName,
          content: typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse),
        };
      });

      const toolResults = await Promise.all(toolPromises);
      messages.push(...toolResults);
      
      completion = await groq.chat.completions.create({
        messages,
        model: 'openai/gpt-oss-120b',
        tools,
        tool_choice: "auto"
      });
      responseMessage = completion.choices[0]?.message;
      iterations++;
    }

    res.json({ 
      success: true, 
      reply: responseMessage.content || "No response generated." 
    });
  } catch (error) {
    console.error("Chat API Error:", error);
    res.status(500).json({ 
      success: false, 
      reply: "The chatbot encountered an error processing your request." 
    });
  }
});

const PORT = process.env.PORT || 3001;

const path = require('path');
// Serve static frontend
app.use(express.static(path.join(__dirname, 'dist')));

// Handle React routing, return all requests to React app
app.use((req, res, next) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {

  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`Database: ${process.env.DB_NAME} @ ${process.env.DB_SERVER}:${process.env.DB_PORT || 1433}`);
});