const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.SUPABASE_URI,
  ssl: { rejectUnauthorized: false }
});

async function createViews() {
  const views = `
    DROP VIEW IF EXISTS "vw_ForecastAccuracySummary" CASCADE;
    CREATE VIEW "vw_ForecastAccuracySummary" AS
    SELECT 
        'v1.0' as ModelVersion, 
        COUNT(*) as RowsEvaluated, 
        SUM(abserrbaseline)/(SUM(actualunits)+1) as WAPE_Baseline, 
        0.05 as WAPE_Adjusted, 
        0.0 as Bias_Adjusted, 
        92.5 as Accuracy_Adjusted
    FROM "FactForecastAccuracy"
    GROUP BY ModelVersion;

    DROP VIEW IF EXISTS "vw_AnomalyCandidates" CASCADE;
    CREATE VIEW "vw_AnomalyCandidates" AS
    SELECT 
        f.datekey as DateKey, f.storekey as StoreKey, f.productkey as ProductKey, 
        f.adjustedforecast as ActualUnits, 
        f.baselineforecast as BaselineForecast, f.adjustedforecast as AdjustedForecast, 
        f.confidence as Confidence, f.primarydriver as PrimaryDriver, 
        10 as Avg28, 0 as Std28, 
        15 as DeviationPct, 'High' as VolumeTier, 
        s.storename as StoreName, s.city as City, p.sku as SKU, p.productname as ProductName, p.category as Category, 
        2.5 as ZScore, 
        CASE WHEN f.confidence < 80 THEN 1 ELSE 0 END as IsAnomaly
    FROM "FactForecast" f
    JOIN "DimStore" s ON f.storekey = s.storekey
    JOIN "DimProduct" p ON f.productkey = p.productkey;

    DROP VIEW IF EXISTS "vw_ForecastVsActual" CASCADE;
    CREATE VIEW "vw_ForecastVsActual" AS
    SELECT 
        d.fulldate as FullDate, s.storename as StoreName, s.city as City, s.region as Region, 
        p.sku as SKU, p.productname as ProductName, p.category as Category, 
        f.baselineforecast as BaselineForecast, f.adjustedforecast as AdjustedForecast, 
        COALESCE(a.actualunits, f.adjustedforecast) as ActualUnits, 
        COALESCE(((a.actualunits - f.adjustedforecast)*1.0 / NULLIF(f.adjustedforecast,0))*100, 0) as DeviationPct, 
        f.confidence as Confidence, f.primarydriver as PrimaryDriver
    FROM "FactForecast" f
    JOIN "DimStore" s ON f.storekey = s.storekey
    JOIN "DimProduct" p ON f.productkey = p.productkey
    JOIN "DimDate" d ON f.datekey = d.datekey
    LEFT JOIN "FactForecastAccuracy" a ON f.storekey = a.storekey AND f.productkey = a.productkey AND f.datekey = a.datekey;
    
    DROP VIEW IF EXISTS "vw_CurrentStockStatus" CASCADE;
    CREATE VIEW "vw_CurrentStockStatus" AS
    SELECT 
        s.storename as StoreName, s.city as City, s.region as Region, 
        p.sku as SKU, p.productname as ProductName, p.category as Category, 
        i.onhandqty as OnHandQty, i.availableqty as AvailableQty, i.intransitqty as InTransitQty, i.safetystockqty as SafetyStockQty, 
        10 as AvgDailySales7d, 14 as DaysOfCover, 'Normal' as StockStatus
    FROM "FactInventory" i
    JOIN "DimStore" s ON i.storekey = s.storekey
    JOIN "DimProduct" p ON i.productkey = p.productkey;
    
    DROP VIEW IF EXISTS "vw_WarehouseAvailable" CASCADE;
    CREATE VIEW "vw_WarehouseAvailable" AS
    SELECT 
        w.warehousekey as WarehouseKey, w.warehousename as WarehouseName, w.city as WarehouseCity, w.dailypickingcapacity as DailyPickingCapacity, 
        p.productkey as ProductKey, p.sku as SKU, p.productname as ProductName, p.category as Category, 
        wi.onhandqty as OnHandQty, wi.reservedqty as ReservedQty, 0 as InTransitInQty, wi.availableqty as AvailableQty
    FROM "FactWarehouseInventory" wi
    JOIN "DimWarehouse" w ON wi.warehousekey = w.warehousekey
    JOIN "DimProduct" p ON wi.productkey = p.productkey;
    
    DROP VIEW IF EXISTS "vw_StoreCapacityUsage" CASCADE;
    CREATE VIEW "vw_StoreCapacityUsage" AS
    SELECT 
        s.storekey as StoreKey, s.storename as StoreName, s.city as City, s.region as Region, s.warehousekey as WarehouseKey, 
        s.storecapacityunits as StoreCapacityUnits, 
        100 as UnitsHeldOrInbound, 
        s.storecapacityunits - 100 as FreeCapacityUnits, 
        (100.0 / NULLIF(s.storecapacityunits, 0)) * 100 as UsedPct
    FROM "DimStore" s;
  `;
  
  try {
    await pool.query(views);
    console.log("Mock views created successfully in Postgres!");
  } catch (err) {
    console.error("Error creating views:", err.message);
  } finally {
    pool.end();
  }
}

createViews();
