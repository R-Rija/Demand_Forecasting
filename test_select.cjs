const { Connection, Request } = require('tedious');
require('dotenv').config();
const c = new Connection({
  server: process.env.DB_SERVER || '127.0.0.1',
  authentication: { type: 'default', options: { userName: process.env.DB_USER, password: process.env.DB_PASSWORD } },
  options: { database: process.env.DB_NAME, encrypt: false, trustServerCertificate: true, port: parseInt(process.env.DB_PORT) || 1433 }
});
c.on('connect', () => {
  const req = new Request("SELECT TOP 5 AllocationKey, Status FROM dbo.FactAllocation", (err) => {
    c.close();
  });
  const cols = [];
  req.on('row', row => cols.push(row[0].value + ':' + row[1].value));
  req.on('requestCompleted', () => console.log(cols));
  c.execSql(req);
});
c.connect();
