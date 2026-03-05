/**
 * EVA Operations API Routes
 *
 * SD: SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I
 *
 * Exposes unified operations status endpoint.
 *
 * @module server/routes/eva-operations
 */

import { Router } from 'express';

const router = Router();

/**
 * GET /api/eva/operations/status
 * Returns aggregated status from all EVA operations subsystems.
 */
router.get('/status', async (req, res) => {
  try {
    const { getOperationsStatus } = await import('../../lib/eva/operations/index.js');
    const supabase = req.app.locals.supabase || req.supabase;
    const status = await getOperationsStatus({ supabase });
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get operations status', message: err.message });
  }
});

/**
 * GET /api/eva/operations/workers
 * Returns registered worker cadence configuration.
 */
router.get('/workers', async (req, res) => {
  try {
    const { OPERATIONS_CADENCES } = await import('../../lib/eva/operations/domain-handler.js');
    res.json({ workers: OPERATIONS_CADENCES });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get worker config', message: err.message });
  }
});

export default router;
