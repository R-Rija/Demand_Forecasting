import { Request, Response, Router } from 'express';
import { query, loadGuardrails } from '../db.js';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
  try {
    const dbRes = await query('SELECT SUSER_SNAME() AS CurrentLogin, DB_NAME() AS DatabaseName');
    const login = dbRes.recordset[0].CurrentLogin;
    const dbName = dbRes.recordset[0].DatabaseName;

    const guardrails = await loadGuardrails();
    const guardrailCount = Object.keys(guardrails).length;

    res.json({
      status: 'ok',
      login,
      dbName,
      guardrailCount,
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;
