import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import analysesRouter from './routes/analyses.js';
import webhooksRouter from './routes/webhooks.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: config.version });
});

app.use('/api/analyses', analysesRouter);
app.use('/webhooks', webhooksRouter);
app.use('/ui', express.static(join(__dirname, '..', 'ui')));

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const server = app.listen(config.port, () => {
  console.log(`CodeGuardian Mock API running on port ${config.port}`);
});

export { app, server };
