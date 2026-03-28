import express from 'express';
import { config } from './config.js';
import analysesRouter from './routes/analyses.js';
import webhooksRouter from './routes/webhooks.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: config.version });
});

app.use('/api/analyses', analysesRouter);
app.use('/webhooks', webhooksRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const server = app.listen(config.port, () => {
  console.log(`CodeGuardian Mock API running on port ${config.port}`);
});

export { app, server };
