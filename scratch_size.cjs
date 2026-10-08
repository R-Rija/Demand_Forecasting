const sql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: true, trustServerCertificate: true }
};

async function checkSize() {
  await sql.connect(config);
  const result = await sql.query(`
    SELECT 
      t.NAME AS TableName,
      p.rows AS RowCounts
    FROM sys.tables t
    INNER JOIN sys.indexes i ON t.OBJECT_ID = i.object_id
    INNER JOIN sys.partitions p ON i.object_id = p.OBJECT_ID AND i.index_id = p.index_id
    WHERE t.is_ms_shipped = 0 AND i.OBJECT_ID > 255 AND i.index_id IN (0,1)
    ORDER BY p.rows DESC;
  `);
  console.log(result.recordset);
  sql.close();
}
checkSize();
