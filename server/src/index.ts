import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { logger } from './log.js';
import { loadGuardrails } from './db.js';
import healthRoute from './routes/health.js';
import apiRoutes from './routes/api.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api', healthRoute);
app.use('/api', apiRoutes);

async function startServer() {
  try {
    // Load guardrails into cache at startup
    await loadGuardrails();
    logger.info('Guardrails loaded successfully.');

    app.listen(config.port, () => {
      logger.info(`RetailAI Backend running on port ${config.port}`);
    });
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

startServer();
