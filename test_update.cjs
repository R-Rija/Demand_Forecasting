const { Connection, Request } = require('tedious');
require('dotenv').config();
const c = new Connection({
  server: process.env.DB_SERVER || '127.0.0.1',
  authentication: { type: 'default', options: { userName: process.env.DB_USER, password: process.env.DB_PASSWORD } },
  options: { database: process.env.DB_NAME, encrypt: false, trustServerCertificate: true, port: parseInt(process.env.DB_PORT) || 1433 }
});
c.on('connect', () => {
  const req = new Request("UPDATE dbo.FactAllocation SET Status = 'APPROVED', DecidedBy = 'Human Operator', DecidedAt = GETDATE() WHERE AllocationKey = 1", (err) => {
    if (err) console.error(err);
    else console.log('success');
    c.close();
  });
  c.execSql(req);
});
c.connect();
