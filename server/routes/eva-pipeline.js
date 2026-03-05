/**
 * EVA Pipeline Data API Routes
 *
 * SD: SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-K
 *
 * Exposes stage 10-12 data aggregation endpoints for GUI dashboards.
 *
 * @module server/routes/eva-pipeline
 */

import { Router } from 'express';

const router = Router();

/**
 * GET /api/eva/pipeline/:ventureId/customer-intelligence
 * Returns Stage 10 customer personas and brand genome data.
 */
router.get('/:ventureId/customer-intelligence', async (req, res) => {
  try {
    const { getCustomerIntelligence } = await import('../../lib/eva/pipeline-data/index.js');
    const supabase = req.app.locals.supabase || req.supabase;
    const data = await getCustomerIntelligence(req.params.ventureId, { supabase });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get customer intelligence', message: err.message });
  }
});

/**
 * GET /api/eva/pipeline/:ventureId/brand-genome
 * Returns Stage 11 visual identity and naming data.
 */
router.get('/:ventureId/brand-genome', async (req, res) => {
  try {
    const { getBrandGenomeData } = await import('../../lib/eva/pipeline-data/index.js');
    const supabase = req.app.locals.supabase || req.supabase;
    const data = await getBrandGenomeData(req.params.ventureId, { supabase });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get brand genome data', message: err.message });
  }
});

/**
 * GET /api/eva/pipeline/:ventureId/gtm-strategy
 * Returns Stage 12 market tiers, channels, and sales model.
 */
router.get('/:ventureId/gtm-strategy', async (req, res) => {
  try {
    const { getGtmStrategy } = await import('../../lib/eva/pipeline-data/index.js');
    const supabase = req.app.locals.supabase || req.supabase;
    const data = await getGtmStrategy(req.params.ventureId, { supabase });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get GTM strategy', message: err.message });
  }
});

/**
 * GET /api/eva/pipeline/:ventureId/summary
 * Returns aggregated pipeline summary for stages 10-12.
 */
router.get('/:ventureId/summary', async (req, res) => {
  try {
    const { getPipelineSummary } = await import('../../lib/eva/pipeline-data/index.js');
    const supabase = req.app.locals.supabase || req.supabase;
    const data = await getPipelineSummary(req.params.ventureId, { supabase });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get pipeline summary', message: err.message });
  }
});

export default router;
