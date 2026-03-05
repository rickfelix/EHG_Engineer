/**
 * EVA Launch Workflow API Routes
 *
 * SD: SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-J
 *
 * Exposes launch readiness, checklist, and timeline endpoints.
 *
 * @module server/routes/eva-launch
 */

import { Router } from 'express';

const router = Router();

/**
 * GET /api/eva/launch/:ventureId/status
 * Returns launch readiness status for a venture.
 */
router.get('/:ventureId/status', async (req, res) => {
  try {
    const { getLaunchStatus } = await import('../../lib/eva/launch-workflow/index.js');
    const supabase = req.app.locals.supabase || req.supabase;
    const status = await getLaunchStatus(req.params.ventureId, { supabase });
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get launch status', message: err.message });
  }
});

/**
 * GET /api/eva/launch/:ventureId/checklist
 * Returns go/no-go checklist derived from chairman gate results.
 */
router.get('/:ventureId/checklist', async (req, res) => {
  try {
    const { getChecklist } = await import('../../lib/eva/launch-workflow/index.js');
    const supabase = req.app.locals.supabase || req.supabase;
    const checklist = await getChecklist(req.params.ventureId, { supabase });
    res.json(checklist);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get checklist', message: err.message });
  }
});

/**
 * GET /api/eva/launch/:ventureId/timeline
 * Returns stage progression timeline for a venture.
 */
router.get('/:ventureId/timeline', async (req, res) => {
  try {
    const { getTimeline } = await import('../../lib/eva/launch-workflow/index.js');
    const supabase = req.app.locals.supabase || req.supabase;
    const timeline = await getTimeline(req.params.ventureId, { supabase });
    res.json(timeline);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get timeline', message: err.message });
  }
});

export default router;
