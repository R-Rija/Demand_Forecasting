require('dotenv').config({ path: '.env' });
const { Connection, Request } = require('tedious');

const config = {
  server: process.env.VITE_GOLD_LAKEHOUSE_ENDPOINT,
  authentication: {
    type: 'azure-active-directory-service-principal-secret',
    options: {
      clientId: process.env.AZURE_CLIENT_ID,
      tenantId: process.env.AZURE_TENANT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
    }
  },
  options: {
    database: 'Demand_Gold_LH',
    encrypt: true,
    port: 1433,
    trustServerCertificate: true
  }
};

const connection = new Connection(config);

connection.on('connect', function(err) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  executeStatement();
});

connection.connect();

function executeStatement() {
  const req1 = new Request('SELECT TOP 1 * FROM dbo.silver_inventory', function(err) {
    if (err) console.error(err);
    const req2 = new Request('SELECT TOP 1 * FROM dbo.gold_daily_demand', function(err) {
        if (err) console.error(err);
        connection.close();
    });
    req2.on('row', function(columns) {
        let row = {};
        columns.forEach(c => row[c.metadata.colName] = c.value);
        console.log('gold_daily_demand:', JSON.stringify(row));
    });
    connection.execSql(req2);
  });

  req1.on('row', function(columns) {
    let row = {};
    columns.forEach(c => row[c.metadata.colName] = c.value);
    console.log('silver_inventory:', JSON.stringify(row));
  });

  connection.execSql(req1);
}
