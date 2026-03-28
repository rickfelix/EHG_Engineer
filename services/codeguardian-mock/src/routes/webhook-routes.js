import { Router } from 'express';
import { WebhookRepository } from '../data/webhook-repository.js';
import { validateWebhook } from '../data/webhook-validator.js';
import crypto from 'node:crypto';

const router = Router();
const repo = new WebhookRepository();

/** Expose repository for testing and seed access */
export { repo as webhookRepo };

router.post('/', (req, res) => {
  const id = crypto.randomUUID();
  const delivery = {
    id,
    delivery_id: req.headers['x-github-delivery'] || req.body.delivery_id || id,
    event_type: req.headers['x-github-event'] || req.body.event_type,
    payload: req.body.payload || req.body,
    signature_valid: true,
    processed_successfully: false,
    sd_id: req.body.sd_id || null,
    received_at: new Date().toISOString()
  };

  const { valid, errors } = validateWebhook('delivery', delivery);
  if (!valid) {
    return res.status(400).json({ error: 'Invalid webhook payload', details: errors });
  }

  try {
    const stored = repo.addDelivery(delivery);
    res.status(200).json({
      message: 'Webhook received',
      delivery_id: stored.id,
      status: 'pending'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to store delivery', message: err.message });
  }
});

router.get('/deliveries', (req, res) => {
  const { event_type, sd_id, limit, offset } = req.query;
  const filters = {};
  if (event_type) filters.event_type = event_type;
  if (sd_id) filters.sd_id = sd_id;
  if (limit) filters.limit = parseInt(limit, 10);
  if (offset) filters.offset = parseInt(offset, 10);

  const all = repo.listDeliveries({});
  const filtered = repo.listDeliveries(filters);
  res.json({
    data: filtered,
    meta: { total: all.length, count: filtered.length, limit: filters.limit || null, offset: filters.offset || 0 }
  });
});

router.get('/pipeline-runs', (req, res) => {
  const { sd_id, status, repository_name, limit, offset } = req.query;
  const filters = {};
  if (sd_id) filters.sd_id = sd_id;
  if (status) filters.status = status;
  if (repository_name) filters.repository_name = repository_name;
  if (limit) filters.limit = parseInt(limit, 10);
  if (offset) filters.offset = parseInt(offset, 10);

  const all = repo.listPipelineRuns({});
  const filtered = repo.listPipelineRuns(filters);
  res.json({
    data: filtered,
    meta: { total: all.length, count: filtered.length, limit: filters.limit || null, offset: filters.offset || 0 }
  });
});

router.get('/stats', (_req, res) => {
  const deliveries = repo.listDeliveries({});
  const runs = repo.listPipelineRuns({});

  const eventTypeCounts = {};
  for (const d of deliveries) {
    eventTypeCounts[d.event_type] = (eventTypeCounts[d.event_type] || 0) + 1;
  }

  const statusCounts = {};
  for (const r of runs) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  }

  const processed = deliveries.filter(d => d.processed_successfully).length;
  res.json({
    total_deliveries: deliveries.length,
    total_pipeline_runs: runs.length,
    event_type_counts: eventTypeCounts,
    pipeline_status_counts: statusCounts,
    processing_rate: deliveries.length > 0 ? (processed / deliveries.length * 100).toFixed(1) + '%' : '0%'
  });
});

export default router;
