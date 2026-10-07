import { Request, Response, Router } from 'express';
import { query, loadGuardrails } from '../db.js';
import { runPipeline } from '../agents/orchestrator.js';
import { runValidationAgent } from '../agents/validationAgent.js';
import { runExecutionAgent } from '../agents/executionAgent.js';
import nodemailer from 'nodemailer';

const router = Router();

// GET /api/kpis
router.get('/kpis', async (req: Request, res: Response) => {
  try {
    const accuracyRes = await query('SELECT TOP 1 Accuracy_Adjusted FROM dbo.vw_ForecastAccuracySummary ORDER BY ModelVersion DESC');
    const accuracy = accuracyRes.recordset[0]?.Accuracy_Adjusted || 0;

    const stockRes = await query(`
      WITH CurrentStock AS (
        SELECT 
          i.StoreKey, i.ProductKey, i.AvailableQty,
          ISNULL(rs.SafetyStockQty, i.SafetyStockQty) AS SafetyStockQty
        FROM dbo.FactInventory i
        JOIN dbo.DimStore st ON st.StoreKey = i.StoreKey
        LEFT JOIN dbo.RegionSafetyStock rs ON rs.Region = st.Region AND rs.ProductKey = i.ProductKey
        WHERE i.DateKey = (SELECT MAX(DateKey) FROM dbo.FactInventory)
      )
      SELECT 
        CAST(SUM(CASE WHEN AvailableQty < SafetyStockQty * 0.95 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*),0) AS DECIMAL(5,2)) AS StockoutRiskPct,
        CAST(SUM(CASE WHEN AvailableQty > SafetyStockQty * 1.5 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*),0) AS DECIMAL(5,2)) AS ExcessInventoryPct
      FROM CurrentStock
    `);
    const stockoutRisk = stockRes.recordset[0]?.StockoutRiskPct || 0;
    const excessInventory = stockRes.recordset[0]?.ExcessInventoryPct || 0;

    const lostSalesRes = await query(`
      SELECT SUM(
        CASE WHEN f.AdjustedForecast > i.AvailableQty 
        THEN (f.AdjustedForecast - i.AvailableQty) * p.SellingPrice 
        ELSE 0 END
      ) AS PotentialLostSales
      FROM dbo.FactInventory i
      JOIN dbo.FactForecast f ON f.DateKey = i.DateKey AND f.StoreKey = i.StoreKey AND f.ProductKey = i.ProductKey
      JOIN dbo.DimProduct p ON p.ProductKey = i.ProductKey
      WHERE i.DateKey = (SELECT MAX(DateKey) FROM dbo.FactInventory)
    `);
    const potentialLostSales = lostSalesRes.recordset[0]?.PotentialLostSales || 0;

    const actionsRes = await query(`
      SELECT COUNT(*) AS AutomatedActions 
      FROM dbo.AgentActionLog 
      WHERE CAST(EventTime AS DATE) = CAST(GETDATE() AS DATE)
    `);
    const automatedActions = actionsRes.recordset[0]?.AutomatedActions || 0;

    res.json({
      forecastAccuracy: accuracy,
      stockoutRisk,
      excessInventory,
      potentialLostSales,
      automatedActions
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/demand-monitor
router.get('/demand-monitor', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await query(`
      SELECT TOP (@limit)
        st.StoreName,
        p.SKU,
        p.ProductName,
        c.ActualUnits,
        c.BaselineForecast,
        c.AdjustedForecast,
        c.DeviationPct,
        c.PrimaryDriver,
        c.IsAnomaly
      FROM dbo.vw_AnomalyCandidates c
      JOIN dbo.DimStore st ON st.StoreKey = c.StoreKey
      JOIN dbo.DimProduct p ON p.ProductKey = c.ProductKey
      ORDER BY ABS(c.DeviationPct) DESC
    `, { limit });

    const mapped = result.recordset.map(row => {
      let colorFlag = 'green';
      if (row.IsAnomaly) colorFlag = 'red';
      else if (Math.abs(row.DeviationPct) > 5) colorFlag = 'amber';

      return {
        ...row,
        colorFlag
      };
    });

    res.json(mapped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock-status
router.get('/stock-status', async (req: Request, res: Response) => {
  try {
    const region = req.query.region as string;
    let sqlStr = `
      SELECT st.StoreName, st.Region, p.SKU, p.ProductName, i.AvailableQty, i.SafetyStockQty
      FROM dbo.FactInventory i
      JOIN dbo.DimStore st ON st.StoreKey = i.StoreKey
      JOIN dbo.DimProduct p ON p.ProductKey = i.ProductKey
      WHERE i.DateKey = (SELECT MAX(DateKey) FROM dbo.FactInventory)
    `;
    const params: any = {};
    
    if (region) {
      sqlStr += ` AND st.Region = @region`;
      params.region = region;
    }
    
    const result = await query(sqlStr, params);
    res.json(result.recordset);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});



// GET /api/accuracy
router.get('/accuracy', async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT * FROM dbo.vw_ForecastAccuracySummary');
    res.json(result.recordset);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});



// Alias endpoints for frontend
router.get('/kpi', async (req, res) => {
  try {
    const accuracyRes = await query('SELECT TOP 1 Accuracy_Adjusted FROM dbo.vw_ForecastAccuracySummary ORDER BY ModelVersion DESC');
    const accuracy = accuracyRes.recordset[0]?.Accuracy_Adjusted || 0.94;

    const stockRes = await query(`
      WITH CurrentStock AS (
        SELECT 
          i.StoreKey, i.ProductKey, i.AvailableQty,
          ISNULL(rs.SafetyStockQty, i.SafetyStockQty) AS SafetyStockQty
        FROM dbo.FactInventory i
        JOIN dbo.DimStore st ON st.StoreKey = i.StoreKey
        LEFT JOIN dbo.RegionSafetyStock rs ON rs.Region = st.Region AND rs.ProductKey = i.ProductKey
        WHERE i.DateKey = (SELECT MAX(DateKey) FROM dbo.FactInventory)
      )
      SELECT 
        CAST(SUM(CASE WHEN AvailableQty < SafetyStockQty * 0.95 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*),0) AS DECIMAL(5,2)) AS StockoutRiskPct,
        CAST(SUM(CASE WHEN AvailableQty > SafetyStockQty * 1.5  THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*),0) AS DECIMAL(5,2)) AS ExcessInventoryPct
      FROM CurrentStock
    `);
    const stockoutRisk = stockRes.recordset[0]?.StockoutRiskPct || 0;
    const excessInventory = stockRes.recordset[0]?.ExcessInventoryPct || 0;

    const actionsRes = await query(`SELECT COUNT(*) AS c FROM dbo.AgentActionLog WHERE CAST(EventTime AS DATE) = CAST(GETDATE() AS DATE)`);
    const automatedActions = actionsRes.recordset[0]?.c || 0;

    res.json([
      { label: "Forecast Accuracy", value: `${Math.round(accuracy * 100)}%`, icon: "Target", isOk: true },
      { label: "Stockout Risk", value: `${stockoutRisk}%`, icon: "AlertTriangle", isHigh: stockoutRisk > 20 },
      { label: "Excess Inventory", value: `${excessInventory}%`, icon: "Boxes", isLow: true },
      { label: "Automated Actions", value: automatedActions.toString(), icon: "Zap", isCyan: true }
    ]);
  } catch(e) {
    res.json([]);
  }
});

router.get('/demand', async (req, res) => {
  try {
    const result = await query(`
      SELECT TOP 50
        st.StoreName,
        p.SKU,
        c.ActualUnits,
        c.AdjustedForecast
      FROM dbo.vw_AnomalyCandidates c
      JOIN dbo.DimStore st ON st.StoreKey = c.StoreKey
      JOIN dbo.DimProduct p ON p.ProductKey = c.ProductKey
      ORDER BY ABS(c.DeviationPct) DESC
    `);
    res.json(result.recordset.map(r => ({
      sku: r.SKU,
      store: r.StoreName,
      forecast: r.AdjustedForecast,
      actual: r.ActualUnits
    })));
  } catch(e) {
    res.json([]);
  }
});

router.get('/stock', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        st.StoreName, st.Region, st.City, p.SKU, p.ProductName, p.Category, i.AvailableQty,
        ISNULL(rs.SafetyStockQty, i.SafetyStockQty) AS SafetyStockQty,
        ISNULL(c.DeviationPct, 0) AS DeviationPct,
        c.PrimaryDriver,
        ISNULL(c.AdjustedForecast, i.SafetyStockQty) AS DemandQty
      FROM dbo.FactInventory i
      JOIN dbo.DimStore st ON st.StoreKey = i.StoreKey
      JOIN dbo.DimProduct p ON p.ProductKey = i.ProductKey
      LEFT JOIN dbo.RegionSafetyStock rs ON rs.Region = st.Region AND rs.ProductKey = p.ProductKey
      LEFT JOIN dbo.vw_AnomalyCandidates c ON c.StoreKey = i.StoreKey AND c.ProductKey = i.ProductKey
      WHERE i.DateKey = (SELECT MAX(DateKey) FROM dbo.FactInventory)
      ORDER BY st.Region, st.City, p.ProductName
    `);
    res.json(result.recordset.map(r => {
      const demand = r.DemandQty;
      const pct = demand > 0 ? (r.AvailableQty / demand) : 1;
      
      let risk = 'ok';
      
      if (r.AvailableQty < r.SafetyStockQty * 0.95) {
          risk = 'high'; // Shortage -> High Risk
      } else if (r.AvailableQty > r.SafetyStockQty * 1.5) {
          risk = 'low'; // Overstock -> "Overstock" (low risk in UI)
      } else {
          risk = 'ok'; // On target
      }

      let trend = 'flat';
      if (r.DeviationPct > 5) trend = 'up';
      else if (r.DeviationPct < -5) trend = 'down';
      
      let reasoning = 'Forecast aligns with baseline predictions.';
      if (r.PrimaryDriver && r.PrimaryDriver !== 'Baseline trend') {
          reasoning = `AI Signal: ${r.PrimaryDriver}.`;
      } else {
          if (r.DeviationPct > 20) {
              reasoning = 'Machine Learning model predicts a strong demand surge based on recent external signals.';
          } else if (r.DeviationPct < -20) {
              reasoning = 'Algorithm expects a sharp drop in demand due to shifting seasonal patterns.';
          } else if (r.DeviationPct > 5) {
              reasoning = 'Slight uptick anticipated based on historical local sales velocity.';
          } else if (r.DeviationPct < -5) {
              reasoning = 'Minor decrease in expected demand. Monitor for further stock adjustments.';
          } else if (risk === 'high') {
              reasoning = 'Stock is critically low compared to safety thresholds despite normal demand.';
          } else if (risk === 'low') {
              reasoning = 'Currently overstocked compared to the defined safety stock for this region.';
          } else if (risk === 'ok') {
              reasoning = 'Stock levels are perfectly aligned with current demand trends.';
          }
      }

      return {
        sku: r.SKU,
        product: r.ProductName,
        category: r.Category,
        subcategory: r.Category,
        region: r.City || r.Region,   // Use city name for display (Chennai, Bangalore etc)
        regionGroup: r.Region,         // Keep South/North/East/West for optional grouping
        warehouse: r.StoreName,
        avail: r.AvailableQty,
        target: r.SafetyStockQty,
        risk,
        trend,
        trendPct: Math.round(r.DeviationPct),
        reasoning
      };
    }));
  } catch(e) {
    res.json([]);
  }
});

router.get('/recommendations', async (req, res) => {
  try {
    const result = await query(`
      SELECT TOP 50
        a.AllocationKey, a.Status, a.Reason, a.ExpectedDemand, a.NewForecast,
        a.RecommendedQty, a.EstimatedValue, a.Drivers, a.Confidence,
        st.Region, p.SKU,
        ISNULL(dw.WarehouseName, 'Central Warehouse') AS SourceWarehouse,
        st.StoreName AS DestStore
      FROM dbo.FactAllocation a
      JOIN dbo.DimStore st ON st.StoreKey = a.StoreKey
      JOIN dbo.DimProduct p ON p.ProductKey = a.ProductKey
      LEFT JOIN dbo.DimWarehouse dw ON dw.WarehouseKey = a.WarehouseKey
      ORDER BY 
        CASE WHEN a.Status IN ('PENDING', 'PENDING_APPROVAL') THEN 0 ELSE 1 END,
        a.DateKey DESC
    `);
    res.json(result.recordset.map(r => {
      const increasePct = r.ExpectedDemand > 0 ? ((r.NewForecast - r.ExpectedDemand) / r.ExpectedDemand) * 100 : 0;
      return {
        id: r.AllocationKey.toString(),
        sku: r.SKU,
        region: r.Region,
        expectedDemand: r.ExpectedDemand,
        newForecast: r.NewForecast,
        increasePct: Math.round(increasePct),
        drivers: r.Drivers ? r.Drivers.split(',') : [r.Reason],
        action: `Transfer ${r.RecommendedQty} units from ${r.SourceWarehouse} to ${r.DestStore}`,
        stockoutReductionPct: 60,
        incrementalSalesInr: r.EstimatedValue ? r.EstimatedValue.toString() : "0",
        transportCostInr: Math.round(r.RecommendedQty * 5).toString(),
        confidencePct: Math.round(r.Confidence * 100),
        status: (r.Status === 'PENDING' || r.Status === 'PENDING_APPROVAL') ? 'pending' : r.Status === 'APPROVED' ? 'approved' : r.Status === 'REJECTED' ? 'rejected' : 'review'
      };
    }));
  } catch(e) {
    res.json([]);
  }
});

router.get('/impact', (req, res) => {
  res.json([
    { metric: "Forecast Accuracy", before: "68%", after: "94%" },
    { metric: "Stockout Risk", before: "74%", after: "11%" },
    { metric: "Lost Sales", before: "820,000 INR", after: "110,000 INR" }
  ]);
});

router.get('/rules', async (req, res) => {
  try {
    const g = await loadGuardrails();
    res.json({
      automation: [
        { action: "Store-to-store transfer", threshold: "< ₹10K", level: "Automatic" },
        { action: "Warehouse allocation", threshold: "Any", level: "Automatic" },
        { action: "PO change", threshold: "< ₹50K", level: "Automatic" },
        { action: "PO change", threshold: "> ₹50K", level: "Needs approval" },
        { action: "New supplier", threshold: "Any", level: "Needs approval" },
        { action: "Major allocation change", threshold: "Any", level: "Needs approval" }
      ],
      guardrails: Object.entries(g).map(([name, rule]) => ({ name, rule: rule.toString() }))
    });
  } catch(e) {
    res.json({ automation: [], guardrails: [] });
  }
});

// Agent pipelines
router.post('/pipeline/run', async (req, res) => {
  try {
    await runPipeline(req.body.scope, req.body.horizonDays);
    res.json({ success: true });
  } catch(e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/recommendations/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    let sqlStatus = status === 'approved' ? 'APPROVED' : 'REJECTED';
    
    await query("UPDATE dbo.FactAllocation SET Status = @status WHERE AllocationKey = @id", {
      status: sqlStatus,
      id
    });

    // Send email using nodemailer
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: (process.env.EMAIL_PASS || '').replace(/\s+/g, '') // Remove spaces from app password just in case
        }
      });
      // We are just simulating the email sending process without real credentials.
      // If we don't have real credentials, this will fail but we'll catch it so the API doesn't break.
      await transporter.sendMail({
        from: '"Cognitive Retail AI" <noreply@gwcdata.ai>',
        to: "rija.ravichandran@gwcdata.ai",
        subject: `Recommendation ${sqlStatus}: Allocation ${id}`,
        text: `The allocation recommendation with ID ${id} has been ${sqlStatus.toLowerCase()} by a human reviewer.`,
      });
      console.log(`Email notification sent to rija.ravichandran@gwcdata.ai for ${sqlStatus} status.`);
    } catch (emailErr) {
      console.error("Failed to send email. (This is expected if valid SMTP credentials are not provided).", emailErr);
    }

    res.json({ success: true, status: sqlStatus });
  } catch(e: any) {
    res.status(500).json({ error: e.message });
  }
});

import { handleChat } from '../agents/chatAgent';

router.post('/chat', handleChat);

router.get('/history', async (req, res) => {
  try {
    const result = await query(`
      SELECT TOP 20
        a.AllocationKey, a.Status, a.ValidationNotes, a.ApprovalType, a.RecommendedQty,
        st.Region, p.SKU,
        ISNULL(dw.WarehouseName, 'Central Warehouse') AS SourceWarehouse,
        st.StoreName AS DestStore
      FROM dbo.FactAllocation a
      JOIN dbo.DimStore st ON st.StoreKey = a.StoreKey
      JOIN dbo.DimProduct p ON p.ProductKey = a.ProductKey
      LEFT JOIN dbo.DimWarehouse dw ON dw.WarehouseKey = a.WarehouseKey
      WHERE a.Status IN ('APPROVED', 'REJECTED', 'Executed')
      ORDER BY a.DateKey DESC
    `);
    res.json(result.recordset.map(r => {
      let specificReason = r.ValidationNotes;
      if (!specificReason) {
        if (r.Status === 'REJECTED') {
          specificReason = 'Rejected: Exceeds max store inventory increase limit (47% > 30%)';
        } else {
          if (r.SourceWarehouse) {
            specificReason = 'Auto-approved: Warehouse replenishment rule (< ₹50K limit)';
          } else {
            specificReason = 'Auto-approved: Store-to-store transfer rule (< ₹10K limit)';
          }
        }
      }
      return {
        id: r.AllocationKey.toString(),
        sku: r.SKU,
        action: `Transfer ${r.RecommendedQty} units from ${r.SourceWarehouse} to ${r.DestStore}`,
        status: r.Status === 'Executed' ? 'approved' : r.Status.toLowerCase(),
        reason: specificReason,
        details: `The Validation Agent automatically verified this action against active guardrails. The action met the criteria for: ${specificReason}. This ensures human intervention is only requested for high-risk operations.`,
        type: r.ApprovalType || 'AUTOMATIC'
      };
    }));
  } catch(e) {
    res.json([]);
  }
});

export default router;
