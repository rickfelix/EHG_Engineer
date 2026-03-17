/**
 * EVA Economic Lens API Routes
 * SD: SD-LEO-FEAT-ECONOMIC-LENS-OPERATIONS-001
 *
 * Endpoints for economic lens analysis: trigger, fetch, and portfolio view.
 */

import { Router } from 'express';
import { validateUuidParam } from '../middleware/validate.js';

const router = Router();

/**
 * GET /api/eva/economic-lens/:ventureId
 * Returns cached economic lens analysis for a venture.
 */
router.get('/:ventureId', validateUuidParam('ventureId'), async (req, res) => {
  try {
    const { getEconomicLens } = await import('../../lib/eva/economic-lens-analysis.js');
    const supabase = req.app.locals.supabase || req.supabase;
    const result = await getEconomicLens(req.params.ventureId, { supabase });

    if (!result) {
      return res.status(404).json({
        error: 'No economic lens analysis found',
        message: 'Run POST to trigger analysis first'
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch economic lens', message: err.message });
  }
});

/**
 * POST /api/eva/economic-lens/:ventureId/analyze
 * Triggers new economic lens analysis (or returns cached if exists).
 */
router.post('/:ventureId/analyze', validateUuidParam('ventureId'), async (req, res) => {
  try {
    const { analyzeEconomicLens } = await import('../../lib/eva/economic-lens-analysis.js');
    const supabase = req.app.locals.supabase || req.supabase;
    const forceRefresh = req.body?.force_refresh === true;

    const result = await analyzeEconomicLens(req.params.ventureId, {
      supabase,
      forceRefresh
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to analyze economic lens', message: err.message });
  }
});

/**
 * GET /api/eva/economic-lens/portfolio/all
 * Returns economic lens data for all ventures (portfolio view).
 */
router.get('/portfolio/all', async (req, res) => {
  try {
    const { getPortfolioEconomicLens } = await import('../../lib/eva/economic-lens-analysis.js');
    const supabase = req.app.locals.supabase || req.supabase;
    const ventures = await getPortfolioEconomicLens({ supabase });
    res.json({ ventures });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch portfolio data', message: err.message });
  }
});

export default router;
