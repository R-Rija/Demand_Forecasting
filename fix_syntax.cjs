const fs = require('fs');

let serverCode = fs.readFileSync('server.cjs', 'utf-8');

// Replace OUTER APPLY with LEFT JOIN LATERAL in hardcoded queries
serverCode = serverCode.replace(/OUTER APPLY \([\s\S]*?\) ([a-zA-Z0-9_]+)/g, (match) => {
  let inner = match.replace(/OUTER APPLY /, 'LEFT JOIN LATERAL ');
  // Replace TOP 1 with LIMIT 1 at the end of the subquery
  inner = inner.replace(/SELECT TOP 1 (.*?)\s+FROM/s, 'SELECT $1 FROM');
  inner = inner.replace(/\)\s*([a-zA-Z0-9_]+)/, ' LIMIT 1) $1 ON true');
  return inner;
});

// Replace DATEADD in hardcoded queries
serverCode = serverCode.replace(/DATEADD\(DAY, -30, NOW\(\)\)/g, "(NOW() - INTERVAL '30 days')");
serverCode = serverCode.replace(/DATEADD\(DAY, -7, CAST\(TO_CHAR, \(SELECT MAX\(DateKey\) FROM dbo\.FactWarehouseInventory\), 112\) AS DATE\)\)/g,
    "(TO_DATE((SELECT MAX(DateKey) FROM dbo.FactWarehouseInventory)::text, 'YYYYMMDD') - INTERVAL '7 days')");

// Also, /api/stock has DATEADD(DAY, -7, CAST(CONVERT(VARCHAR, (SELECT MAX(DateKey) FROM dbo.FactWarehouseInventory), 112) AS DATE))
serverCode = serverCode.replace(/DATEADD\(DAY, -7, CAST\(CONVERT\(VARCHAR, \(SELECT MAX\(DateKey\) FROM dbo\.FactWarehouseInventory\), 112\) AS DATE\)\)/g,
    "(TO_DATE((SELECT MAX(DateKey) FROM dbo.FactWarehouseInventory)::text, 'YYYYMMDD') - INTERVAL '7 days')");

fs.writeFileSync('server.cjs', serverCode);
console.log("Replaced MSSQL syntax with Postgres syntax in server.cjs!");
