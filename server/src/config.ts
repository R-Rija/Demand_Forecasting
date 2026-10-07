import dotenv from 'dotenv';

dotenv.config();

export const config = {
  db: {
    server: process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433'),
    database: process.env.DB_NAME || 'RetailAI',
    user: process.env.DB_USER || 'retailai_agent',
    password: process.env.DB_PASSWORD || '',
  },
  port: parseInt(process.env.PORT || '4000'),
  groq: {
    apiKey: process.env.GROQ_API_KEY || process.env.GROQ_API_KEYS?.split(',')[0] || '',
    model: process.env.GROQ_MODEL || 'mixtral-8x7b-32768',
  },
  isDryRun: process.env.AGENT_DRY_RUN === 'true',
};

// We will load and cache guardrails from DB
let guardrailsCache: Record<string, number> = {};
let lastCacheTime = 0;

export function setGuardrails(guardrails: Record<string, number>) {
  guardrailsCache = guardrails;
  lastCacheTime = Date.now();
}

export function getGuardrails() {
  return guardrailsCache;
}

export function getGuardrailsAgeMs() {
  return Date.now() - lastCacheTime;
}
