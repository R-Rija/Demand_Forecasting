import re

with open('server.cjs', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Replace mssql with pg
code = code.replace("const { Connection, Request } = require('tedious');", "const { Pool } = require('pg');")

# 2. Replace connection config
old_config = """const config = {
  server: process.env.DB_SERVER,
  authentication: { type: 'default', options: { userName: process.env.DB_USER, password: process.env.DB_PASSWORD } },
  options: { encrypt: true, database: process.env.DB_NAME, trustServerCertificate: true, rowCollectionOnRequestCompletion: true }
};"""
new_config = """const pool = new Pool({
  connectionString: process.env.SUPABASE_URI,
  ssl: { rejectUnauthorized: false }
});"""
code = code.replace(old_config, new_config)

# 3. Replace executeSql logic
old_exec = """const queryQueue = [];
let isExecuting = false;

function executeSql(query) {
  return new Promise((resolve, reject) => {
    queryQueue.push({ query, resolve, reject });
    processQueue();
  });
}

function processQueue() {
  if (isExecuting || queryQueue.length === 0) return;
  isExecuting = true;
  const { query, resolve, reject } = queryQueue.shift();
  console.log("➡️ Starting query execution. Queue length:", queryQueue.length);
  
  const connection = new Connection(config);
  connection.on('connect', (err) => {
    if (err) {
      console.error('❌ Connection Failed:', err.message);
      reject(err);
      isExecuting = false;
      processQueue();
      return;
    }
    console.log("🔌 Connected to SQL Server. Executing SQL...");
    const request = new Request(query, (err) => {
      if (err) {
        console.error('❌ Query Failed:', err.message, "Query:", query);
        reject(err);
      }
      connection.close();
      isExecuting = false;
      processQueue();
    });

    const result = [];
    request.on('row', (columns) => {
      const row = {};
      columns.forEach((column) => { row[column.metadata.colName] = column.value; });
      result.push(row);
    });

    request.on('requestCompleted', () => {
      resolve(result);
    });

    request.on('error', (err) => {
      reject(err);
    });

    try {
      connection.execSql(request);
    } catch (execErr) {
      reject(execErr);
      connection.close();
      isExecuting = false;
      processQueue();
    }
  });
  
  try {
    connection.connect();
  } catch (connErr) {
    reject(connErr);
    isExecuting = false;
    processQueue();
  }
}"""

new_exec = """async function executeSql(query) {
  try {
    // Replace typical MSSQL syntax with Postgres syntax
    let pgQuery = query.replace(/dbo\./g, 'public.');
    
    // Replace SELECT TOP X with LIMIT X
    pgQuery = pgQuery.replace(/SELECT\\s+TOP\\s+(\\d+)(.*?)FROM/gis, "SELECT $2 FROM");
    const topMatch = query.match(/SELECT\\s+TOP\\s+(\\d+)/i);
    if (topMatch) {
        pgQuery += ` LIMIT ${topMatch[1]}`;
    }
    
    // Replace ISNULL with COALESCE
    pgQuery = pgQuery.replace(/ISNULL\\(/gi, 'COALESCE(');

    // Specific fix for the complex date filter
    if (pgQuery.includes("DATEADD(DAY, -7, CAST(CONVERT(VARCHAR, (SELECT MAX(DateKey)")) {
        pgQuery = pgQuery.replace(/DATEADD\\(DAY,\\s*-7,\\s*CAST\\(CONVERT\\(VARCHAR,\\s*\\(SELECT MAX\\(DateKey\\) FROM public\\.FactWarehouseInventory\\),\\s*112\\)\\s*AS DATE\\)\\)/gi, 
            "(TO_DATE((SELECT MAX(\\"DateKey\\") FROM public.\\"FactWarehouseInventory\\")::text, 'YYYYMMDD') - INTERVAL '7 days')");
    }
    
    // Fix quote identifiers for Postgres (Case Sensitivity)
    // Wrap common table/column names in double quotes if needed, but since our script creates them lowercase/exact, we can use exact match if we quote everything.
    // Let's just wrap known tables in quotes
    const tables = ['DimProduct', 'DimStore', 'DimWarehouse', 'FactWarehouseInventory', 'FactSales', 'FactForecast', 'FactAllocation', 'AgentActionLog', 'GuardrailConfig', 'RegionSafetyStock', 'FactForecastAccuracy'];
    for(const t of tables) {
        pgQuery = pgQuery.replace(new RegExp(`public\\.${t}`, 'gi'), `public."${t}"`);
    }

    const { rows } = await pool.query(pgQuery);
    return rows;
  } catch (err) {
    console.error("❌ Query Failed:", err.message, "\\nQuery:", query);
    throw err;
  }
}"""

code = code.replace(old_exec, new_exec)

# 4. Replace specific MSSQL types/hints
code = code.replace("T-SQL", "PostgreSQL")
code = code.replace("Always add TOP 50", "Always add LIMIT 50")
code = code.replace("RetailAI SQL Server", "RetailAI PostgreSQL")
code = code.replace("Always include TOP 50.", "Always include LIMIT 50.")
code = code.replace("CONVERT(VARCHAR", "TO_CHAR")
code = code.replace("GETDATE()", "NOW()")

with open('server.cjs', 'w', encoding='utf-8') as f:
    f.write(code)
