/**
 * Stage 24 Go Live API Routes
 *
 * Path: /api/stage24
 *
 * Endpoints:
 *   POST /:ventureId/go-live - Mark venture as launched, record timestamp
 *
 * SD-MAN-ORCH-S18-S26-PIPELINE-001-C
 *
 * @module server/routes/stage24
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/middleware/eva-error-handler.js';
import { isValidUuid } from '../middleware/validate.js';

const router = Router();

/**
 * POST /api/stage24/:ventureId/go-live
 * Marks venture as launched and records the timestamp.
 * Idempotent: returns 400 if already launched.
 */
router.post('/:ventureId/go-live', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;
  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }

  const supabase = req.app.locals.supabase || req.supabase;

  // Verify venture exists
  const { data: venture, error: ventureErr } = await supabase
    .from('ventures')
    .select('id, name')
    .eq('id', ventureId)
    .single();

  if (ventureErr || !venture) {
    return res.status(404).json({ error: 'Venture not found', code: 'VENTURE_NOT_FOUND' });
  }

  // Check if already launched by looking for existing artifact with launched_at
  const { data: existing } = await supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'blueprint_go_live')
    .single();

  if (existing?.artifact_data?.launched_at) {
    return res.status(400).json({
      error: 'Venture already launched',
      code: 'ALREADY_LAUNCHED',
      launched_at: existing.artifact_data.launched_at,
    });
  }

  const launchedAt = new Date().toISOString();

  // Store go-live artifact
  const { error: artifactErr } = await supabase
    .from('venture_artifacts')
    .upsert({
      venture_id: ventureId,
      artifact_type: 'blueprint_go_live',
      stage_number: 24,
      artifact_data: {
        launched_at: launchedAt,
        launched_by: 'chairman',
        venture_name: venture.name,
      },
    }, { onConflict: 'venture_id,artifact_type' });

  if (artifactErr) {
    console.error('[stage24-route] go-live artifact upsert error:', artifactErr.message);
    return res.status(500).json({ error: 'Failed to record launch', code: 'ARTIFACT_ERROR' });
  }

  return res.status(200).json({
    status: 'success',
    data: {
      launched_at: launchedAt,
      venture_name: venture.name,
    },
  });
}));

export default router;
