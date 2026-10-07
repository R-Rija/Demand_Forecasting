require('dotenv').config();
const { Connection, Request } = require('tedious');
const config = {
  server: process.env.DB_SERVER || '127.0.0.1',
  authentication: { type: 'default', options: { userName: process.env.DB_USER, password: process.env.DB_PASSWORD } },
  options: { database: process.env.DB_NAME, encrypt: false, trustServerCertificate: true, port: parseInt(process.env.DB_PORT) || 1433, connectTimeout: 15000 }
};
const conn = new Connection(config);
conn.on('connect', err => {
  if (err) { console.error('CONN ERR:', err.message); process.exit(1); }
  const queries = [
    "SELECT TOP 3 * FROM dbo.AgentActionLog",
    "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='AgentActionLog' ORDER BY ORDINAL_POSITION",
    "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='FactAllocation' ORDER BY ORDINAL_POSITION",
    "SELECT TOP 5 * FROM dbo.FactAllocation ORDER BY AllocationKey DESC",
  ];
  let i = 0;
  function next() {
    if (i >= queries.length) { conn.close(); return; }
    const sql = queries[i++];
    console.log('\n=== QUERY:', sql, '===');
    const req = new Request(sql, (err) => { if (err) console.error('ERR:', err.message); next(); });
    req.on('row', cols => { let r={}; cols.forEach(c=>r[c.metadata.colName]=c.value); console.log(JSON.stringify(r)); });
    conn.execSql(req);
  }
  next();
});
conn.connect();
