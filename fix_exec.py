import re

with open('server.cjs', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace executeSql and processQueue entirely!
old_pattern = r'const queryQueue = \[\];.*?function processQueue\(\) \{.*?\n  \}\n\}'
match = re.search(old_pattern, text, flags=re.DOTALL)
if match:
    text = text.replace(match.group(0), '')
else:
    # Try another pattern
    print("Match failed")
    import sys; sys.exit(1)

new_exec = '''
async function executeSql(query) {
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
    const tables = ['DimProduct', 'DimStore', 'DimWarehouse', 'FactWarehouseInventory', 'FactSales', 'FactForecast', 'FactAllocation', 'AgentActionLog', 'GuardrailConfig', 'RegionSafetyStock', 'FactForecastAccuracy'];
    for(const t of tables) {
        pgQuery = pgQuery.replace(new RegExp(`public\\\\.\\\\${t}`, 'gi'), `public."${t}"`);
    }

    const { rows } = await pool.query(pgQuery);
    return rows;
  } catch (err) {
    console.error("❌ Query Failed:", err.message, "\\nQuery:", query);
    throw err;
  }
}
'''
text = re.sub(r'(const pool = new Pool\(\{.*?\n\}\);)', r'\1\n\n' + new_exec, text, flags=re.DOTALL)

with open('server.cjs', 'w', encoding='utf-8') as f:
    f.write(text)
