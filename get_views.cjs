const sql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: true, trustServerCertificate: true }
};

async function getViews() {
  await sql.connect(config);
  let result = await sql.query(`
    SELECT o.name, m.definition
    FROM sys.sql_modules m 
    JOIN sys.objects o ON m.object_id = o.object_id 
    WHERE o.name LIKE 'vw_%'
  `);
  
  result.recordset.forEach(r => {
    console.log("=== " + r.name + " ===");
    console.log(r.definition);
  });
  
  sql.close();
}
getViews();
