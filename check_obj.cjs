const sql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: true, trustServerCertificate: true }
};

async function checkObj() {
  await sql.connect(config);
  let result = await sql.query(`
    SELECT name, type, type_desc 
    FROM sys.objects 
    WHERE name LIKE '%vw_%'
  `);
  console.log(result.recordset);
  sql.close();
}
checkObj();
