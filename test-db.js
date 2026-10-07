import sql from 'mssql';

const sqlConfig = {
  user: 'retailai_agent',
  password: 'ChangeMe_Str0ng!Pass#2026',
  database: 'RetailAI',
  server: '127.0.0.1',
  port: 1433,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

async function run() {
  try {
    const pool = new sql.ConnectionPool(sqlConfig);
    await pool.connect();
    const result = await pool.request().query('SELECT DB_NAME() AS DB');
    console.log("Connected successfully to DB:", result.recordset[0].DB);
    process.exit(0);
  } catch (err) {
    console.error("Connection failed:", err);
    process.exit(1);
  }
}

run();
