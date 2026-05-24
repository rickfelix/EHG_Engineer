/**
 * Stage 17 Design Refinement API Routes
 *
 * Path: /api/stage17
 *
 * SD-LEO-ORCH-REPLACE-GOOGLE-STITCH-001-B: Stitch-specific routes removed.
 * SD-LEO-REFAC-EXTRACT-S17-ARCHETYPE-001: legacy archetype-generation endpoints
 * removed (GVOS composer is the live path). Retained: strategy-recommendation,
 * selection, refine, approval, QA, and upload endpoints.
 *
 * @module server/routes/stage17
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/middleware/eva-error-handler.js';
import { isValidUuid } from '../middleware/validate.js';
import { submitPass1Selection, submitPass2Selection, isDesignPassComplete, SelectionError } from '../../lib/eva/stage-17/selection-flow.js';
import { runQARubric, uploadToGitHub, UploadError } from '../../lib/eva/stage-17/qa-rubric.js';
import { recommendStrategies } from '../../lib/eva/stage-17/strategy-recommender.js';
import { createOrReusePendingDecision } from '../../lib/eva/chairman-decision-watcher.js';

const router = Router();

/**
 * Sanitize an error message before returning it to a client.
 */
function sanitizeErrorMessage(message) {
  if (!message || typeof message !== 'string') return 'Operation failed';
  let sanitized = message
    .replace(/[A-Za-z]:[\\/][^\s)'"]+/g, '<path>')
    .replace(/\/(?:home|Users|var|opt|etc)\/[^\s)'"]+/g, '<path>')
    .replace(/\b[A-Z][A-Z0-9_]{11,}\b/g, '<env>')
    .split('\n')[0]
    .trim();
  if (sanitized.length > 500) sanitized = sanitized.substring(0, 500) + '…';
  return sanitized || 'Operation failed';
}

// ── Stage 17 Design Refinement Endpoints ────────────────────────────────────

/**
 * POST /api/stage17/:ventureId/strategy-recommendation
 * Returns ranked design strategies based on upstream venture data.
 * SD-S17-STRATEGYFIRST-DESIGN-DIRECTION-ORCH-001-A
 */
router.post('/:ventureId/strategy-recommendation', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;

  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }

  const supabase = req.app.locals.supabase || req.supabase;
  const result = await recommendStrategies(ventureId, supabase);

  return res.status(200).json({
    status: 'success',
    data: result,
  });
}));

/**
 * POST /api/stage17/:ventureId/select — Pass 1 selection
 */
router.post('/:ventureId/select', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;
  const { screenId, selectedIds } = req.body || {};

  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }
  if (!screenId || typeof screenId !== 'string') {
    return res.status(400).json({ error: 'screenId is required', code: 'MISSING_SCREEN_ID' });
  }
  if (!Array.isArray(selectedIds) || selectedIds.length !== 2) {
    return res.status(400).json({ error: 'selectedIds must be an array of exactly 2 IDs', code: 'INVALID_SELECTION_COUNT' });
  }

  const supabase = req.app.locals.supabase || req.supabase;
  try {
    const refinedArtifactIds = await submitPass1Selection(ventureId, screenId, selectedIds, supabase);
    return res.status(200).json({ refinedArtifactIds });
  } catch (err) {
    if (err instanceof SelectionError) {
      return res.status(400).json({ error: err.message, code: 'SELECTION_ERROR' });
    }
    console.error('[stage17-route] stage17/select failed:', err);
    return res.status(500).json({ error: sanitizeErrorMessage(err?.message), code: 'SELECT_ERROR' });
  }
}));

/**
 * POST /api/stage17/:ventureId/refine — Pass 2 selection
 */
router.post('/:ventureId/refine', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;
  const { screenId, platform, artifactId, uploadedHtml } = req.body || {};

  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }
  if (!screenId || typeof screenId !== 'string') {
    return res.status(400).json({ error: 'screenId is required', code: 'MISSING_SCREEN_ID' });
  }
  if (!platform || !['mobile', 'desktop'].includes(platform)) {
    return res.status(400).json({ error: 'platform must be "mobile" or "desktop"', code: 'INVALID_PLATFORM' });
  }

  const supabase = req.app.locals.supabase || req.supabase;

  // Upload path: external HTML auto-approved as the design for this screen
  if (uploadedHtml && typeof uploadedHtml === 'string') {
    try {
      const { writeArtifact } = await import('../../lib/eva/artifact-persistence-service.js');
      const artifactType = platform === 'mobile' ? 'stage_17_approved_mobile' : 'stage_17_approved_desktop';

      const approvedArtifactId = await writeArtifact(supabase, {
        ventureId,
        lifecycleStage: 17,
        artifactType,
        title: `${screenId} — Uploaded Design`,
        content: uploadedHtml,
        artifactData: { html: uploadedHtml, source: 'manual_upload' },
        source: 'manual-upload',
        metadata: { screenId, platform, uploadedAt: new Date().toISOString() },
      });

      console.log(`[stage17-route] Uploaded HTML approved for ${screenId} (${uploadedHtml.length} chars)`);
      return res.status(200).json({ approvedArtifactId, replaced: false, uploaded: true });
    } catch (err) {
      console.error('[stage17-route] Upload approval failed:', err);
      return res.status(500).json({ error: sanitizeErrorMessage(err?.message), code: 'UPLOAD_ERROR' });
    }
  }

  // Standard path: approve an existing variant
  if (!artifactId || typeof artifactId !== 'string') {
    return res.status(400).json({ error: 'artifactId is required', code: 'MISSING_ARTIFACT_ID' });
  }

  try {
    const result = await submitPass2Selection(ventureId, screenId, platform, artifactId, supabase);
    return res.status(200).json({ approvedArtifactId: result.approvedArtifactId, replaced: result.replaced });
  } catch (err) {
    if (err instanceof SelectionError) {
      return res.status(400).json({ error: err.message, code: 'SELECTION_ERROR' });
    }
    console.error('[stage17-route] stage17/refine failed:', err);
    return res.status(500).json({ error: sanitizeErrorMessage(err?.message), code: 'REFINE_ERROR' });
  }
}));

/**
 * POST /api/stage17/:ventureId/approve — Check completion and auto-approve chairman gate
 *
 * When all screens have approved artifacts, creates/updates the chairman
 * decision for stage 17 to 'approved' so the worker can advance to stage 18.
 */
router.post('/:ventureId/approve', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;
  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }

  const supabase = req.app.locals.supabase || req.supabase;
  try {
    const complete = await isDesignPassComplete(ventureId, supabase);
    if (!complete) {
      return res.status(200).json({ complete: false });
    }

    // All screens approved — auto-approve the chairman gate so the worker advances
    const { id: decisionId } = await createOrReusePendingDecision({
      ventureId,
      stageNumber: 17,
      briefData: { stage: 17, gate_recommendation: 'PASS', source: 'design_selection_complete' },
      summary: 'All design screens approved — auto-advancing',
      supabase,
    });

    if (decisionId) {
      await supabase
        .from('chairman_decisions')
        .update({ status: 'approved', decision: 'approve', resolved_at: new Date().toISOString() })
        .eq('id', decisionId);
    }

    return res.status(200).json({ complete: true, decisionId });
  } catch (err) {
    console.error('[stage17-route] stage17/approve failed:', err);
    return res.status(500).json({ error: sanitizeErrorMessage(err?.message), code: 'APPROVE_ERROR' });
  }
}));

/**
 * POST /api/stage17/:ventureId/qa — Run QA rubric
 */
router.post('/:ventureId/qa', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;
  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }

  const supabase = req.app.locals.supabase || req.supabase;
  try {
    const result = await runQARubric(ventureId, supabase);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[stage17-route] stage17/qa failed:', err);
    return res.status(500).json({ error: sanitizeErrorMessage(err?.message), code: 'QA_ERROR' });
  }
}));

/**
 * POST /api/stage17/:ventureId/upload — Upload to GitHub
 */
router.post('/:ventureId/upload', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;
  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }

  const supabase = req.app.locals.supabase || req.supabase;
  try {
    const result = await uploadToGitHub(ventureId, supabase, {});
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof UploadError) {
      return res.status(400).json({ error: err.message, code: 'UPLOAD_BLOCKED', gaps: err.gaps });
    }
    console.error('[stage17-route] stage17/upload failed:', err);
    return res.status(500).json({ error: sanitizeErrorMessage(err?.message), code: 'UPLOAD_ERROR' });
  }
}));

export default router;
