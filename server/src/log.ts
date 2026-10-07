import pino from 'pino';
import { query } from './db.js';

export const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

export async function writeAgentLog(
  agentName: string,
  actionType: string,
  details: any,
  storeKey: number | null = null,
  productKey: number | null = null,
  status: string | null = null,
  approvedBy: string | null = null
) {
  try {
    const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);
    await query(`
      INSERT INTO dbo.AgentActionLog (AgentName, ActionType, StoreKey, ProductKey, Details, Status, ApprovedBy)
      VALUES (@agentName, @actionType, @storeKey, @productKey, @details, @status, @approvedBy)
    `, {
      agentName,
      actionType,
      storeKey,
      productKey,
      details: detailsStr,
      status,
      approvedBy
    });
  } catch (err) {
    logger.error({ err, agentName, actionType }, 'Failed to write agent log to DB');
  }
}
