require('dotenv').config();
const { Connection, Request } = require('tedious');

const config = {
  authentication: {
    options: {
      clientId: process.env.AZURE_CLIENT_ID,
      tenantId: process.env.AZURE_TENANT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET
    },
    type: 'azure-active-directory-service-principal-secret'
  },
  server: process.env.VITE_GOLD_LAKEHOUSE_ENDPOINT,
  options: {
    database: 'Demand_Gold_LH',
    encrypt: true,
    port: 1433
  }
};

const connection = new Connection(config);
connection.on('connect', err => {
  if (err) { console.error(err); return; }
  const request = new Request('SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ''dbo''', (err) => {
    connection.close();
  });
  request.on('row', columns => console.log(columns[0].value));
  connection.execSql(request);
});
connection.connect();
