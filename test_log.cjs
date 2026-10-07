const { Connection, Request } = require('tedious');
require('dotenv').config();
const c = new Connection({
  server: process.env.DB_SERVER || '127.0.0.1',
  authentication: { type: 'default', options: { userName: process.env.DB_USER, password: process.env.DB_PASSWORD } },
  options: { database: process.env.DB_NAME, encrypt: false, trustServerCertificate: true, port: parseInt(process.env.DB_PORT) || 1433 }
});
c.on('connect', () => {
  const req = new Request(`
      INSERT INTO dbo.AgentActionLog (EventTime, AgentName, ActionType, StoreKey, ProductKey, Details, Status, ApprovedBy)
      SELECT
        GETDATE(),
        'Human Operator',
        'Recommendation APPROVED',
        fa.StoreKey,
        fa.ProductKey,
        CONCAT('Allocation #1 APPROVED by operator. Qty: ', fa.RecommendedQty),
        'APPROVED',
        'Human Operator'
      FROM dbo.FactAllocation fa
      WHERE fa.AllocationKey = 1
  `, (err) => {
    if (err) console.error(err);
    else console.log('success');
    c.close();
  });
  c.execSql(req);
});
c.connect();
