/**
 * Stage 17 Design Refinement API Routes
 *
 * Path: /api/stage17
 *
 * SD-LEO-ORCH-REPLACE-GOOGLE-STITCH-001-B: Stitch-specific routes removed.
 * Retained: S17 archetype generation, selection, approval, QA, and upload endpoints.
 *
 * @module server/routes/stage17
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/middleware/eva-error-handler.js';
import { isValidUuid } from '../middleware/validate.js';
import { generateArchetypes } from '../../lib/eva/stage-17/archetype-generator.js';
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

/** Per-venture rate limiter for archetype generation (1 call per 10s per venture). */
const archetypeRateLimiter = new Map();
const ARCHETYPE_RATE_LIMIT_TTL_MS = 10_000;

/** Active archetype generation AbortControllers keyed by ventureId. */
const activeArchetypeGenerations = new Map();

// Clean up stale rate limiter entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of archetypeRateLimiter) {
    if (now - ts > ARCHETYPE_RATE_LIMIT_TTL_MS) archetypeRateLimiter.delete(key);
  }
}, 60_000).unref();

/**
 * POST /api/stage17/:ventureId/archetypes
 * Generates 6 HTML design archetypes per screen.
 */
router.post('/:ventureId/archetypes', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;

  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }

  const now = Date.now();
  const lastCall = archetypeRateLimiter.get(ventureId);
  if (lastCall && now - lastCall < ARCHETYPE_RATE_LIMIT_TTL_MS) {
    const retryAfter = Math.ceil((ARCHETYPE_RATE_LIMIT_TTL_MS - (now - lastCall)) / 1000);
    return res.status(429).json({ error: 'Too Many Requests', code: 'RATE_LIMITED', retryAfter });
  }
  archetypeRateLimiter.set(ventureId, now);

  const supabase = req.app.locals.supabase || req.supabase;

  const existing = activeArchetypeGenerations.get(ventureId);
  if (existing) {
    existing.abort();
    console.info(`[stage17-route] Cancelled previous archetype generation for ${ventureId.slice(0, 8)}`);
  }

  const ac = new AbortController();
  activeArchetypeGenerations.set(ventureId, ac);

  res.status(202).json({ status: 'generating', message: 'Archetype generation started. Monitor progress via artifact count.' });

  // SD-S17-STRATEGYFIRST: pass preview and strategy query params
  const previewMode = req.query.preview === 'true';
  const strategyFilter = req.query.strategy || undefined;

  generateArchetypes(ventureId, supabase, { signal: ac.signal, preview: previewMode, strategy: strategyFilter })
    .then(result => {
      const label = result.cancelled ? 'cancelled' : 'complete';
      console.log(`[stage17-route] stage17/archetypes ${label}: ${result.artifactIds?.length ?? 0} archetypes for ${ventureId.slice(0, 8)}`);
    })
    .catch(err => {
      console.error('[stage17-route] stage17/archetypes background failed:', err.message ?? err);
    })
    .finally(() => {
      activeArchetypeGenerations.delete(ventureId);
    });
  return;
}));

/**
 * POST /api/stage17/:ventureId/archetypes/cancel
 */
router.post('/:ventureId/archetypes/cancel', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;
  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }

  const ac = activeArchetypeGenerations.get(ventureId);
  if (ac) {
    ac.abort();
    activeArchetypeGenerations.delete(ventureId);
    console.info(`[stage17-route] Archetype generation cancelled for ${ventureId.slice(0, 8)}`);
    return res.json({ cancelled: true, message: 'Generation will stop after the current screen completes.' });
  }

  return res.status(404).json({ cancelled: false, message: 'No active archetype generation found for this venture.' });
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
