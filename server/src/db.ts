import sql from 'mssql';
import { config, setGuardrails } from './config.js';

const sqlConfig: sql.config = {
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  server: config.db.server,
  port: config.db.port,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  options: {
    encrypt: true,
    trustServerCertificate: true // change to true for local dev / self-signed certs
  }
};

let pool: sql.ConnectionPool;

export async function getDb() {
  if (!pool) {
    pool = new sql.ConnectionPool(sqlConfig);
    await pool.connect();
  }
  return pool;
}

export async function query(queryStr: string, params?: Record<string, any>) {
  const p = await getDb();
  const request = p.request();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
  }
  return request.query(queryStr);
}

export async function loadGuardrails() {
  const result = await query('SELECT RuleName, RuleValue FROM dbo.GuardrailConfig');
  const record: Record<string, number> = {};
  for (const row of result.recordset) {
    record[row.RuleName] = row.RuleValue;
  }
  setGuardrails(record);
  return record;
}
