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
  const sql = "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo' ORDER BY TABLE_NAME, ORDINAL_POSITION";
  const req = new Request(sql, (err) => { if (err) { console.error(err.message); } conn.close(); });
  const rows = [];
  req.on('row', cols => { let r={}; cols.forEach(c=>r[c.metadata.colName]=c.value); rows.push(r); });
  req.on('requestCompleted', () => console.log(JSON.stringify(rows)));
  conn.execSql(req);
});
conn.connect();
