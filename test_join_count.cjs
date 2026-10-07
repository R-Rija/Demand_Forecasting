const { Connection, Request } = require('tedious');
require('dotenv').config();
const c = new Connection({
  server: process.env.DB_SERVER || '127.0.0.1',
  authentication: { type: 'default', options: { userName: process.env.DB_USER, password: process.env.DB_PASSWORD } },
  options: { database: process.env.DB_NAME, encrypt: false, trustServerCertificate: true, port: parseInt(process.env.DB_PORT) || 1433 }
});
c.on('connect', () => {
  const req = new Request(`
      SELECT COUNT(*) FROM dbo.FactAllocation fa
      JOIN dbo.DimProduct dp ON fa.ProductKey = dp.ProductKey
      JOIN dbo.DimStore ds ON fa.StoreKey = ds.StoreKey
      JOIN dbo.DimWarehouse dw ON fa.WarehouseKey = dw.WarehouseKey
  `, (err) => {
    c.close();
  });
  const cols = [];
  req.on('row', row => cols.push(row[0].value));
  req.on('requestCompleted', () => console.log('Joined rows count: ' + cols[0]));
  c.execSql(req);
});
c.connect();
