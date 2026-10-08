with open('server.cjs', 'r', encoding='utf-8') as f:
    text = f.read()

start_idx = text.find('const queryQueue = [];')
end_idx = text.find('function processQueue() {')
if start_idx != -1 and end_idx != -1:
    end_bracket = text.find('}\n}', end_idx) + 3
    old_exec = text[start_idx:end_bracket]
    
    new_exec = '''
async function executeSql(query) {
  try {
    let pgQuery = query.replace(/dbo\\./g, 'public.');
    pgQuery = pgQuery.replace(/SELECT\\s+TOP\\s+(\\d+)(.*?)FROM/gis, "SELECT $2 FROM");
    const topMatch = query.match(/SELECT\\s+TOP\\s+(\\d+)/i);
    if (topMatch) { pgQuery += ` LIMIT ${topMatch[1]}`; }
    pgQuery = pgQuery.replace(/ISNULL\\(/gi, 'COALESCE(');
    if (pgQuery.includes("DATEADD(DAY, -7, CAST(CONVERT(VARCHAR, (SELECT MAX(DateKey)")) {
        pgQuery = pgQuery.replace(/DATEADD\\(DAY,\\s*-7,\\s*CAST\\(CONVERT\\(VARCHAR,\\s*\\(SELECT MAX\\(DateKey\\) FROM public\\.FactWarehouseInventory\\),\\s*112\\)\\s*AS DATE\\)\\)/gi, 
            "(TO_DATE((SELECT MAX(\\"DateKey\\") FROM public.\\"FactWarehouseInventory\\")::text, 'YYYYMMDD') - INTERVAL '7 days')");
    }
    const tables = ['DimProduct', 'DimStore', 'DimWarehouse', 'FactWarehouseInventory', 'FactSales', 'FactForecast', 'FactAllocation', 'AgentActionLog', 'GuardrailConfig', 'RegionSafetyStock', 'FactForecastAccuracy'];
    for(const t of tables) { pgQuery = pgQuery.replace(new RegExp(`public\\\\.${t}`, 'gi'), `public."${t}"`); }
    const { rows } = await pool.query(pgQuery);
    return rows;
  } catch (err) {
    console.error("❌ Query Failed:", err.message, "\\nQuery:", query);
    throw err;
  }
}
'''
    text = text.replace(old_exec, new_exec)
    with open('server.cjs', 'w', encoding='utf-8') as f:
        f.write(text)
    print('Replaced')
else:
    print('Not found')
