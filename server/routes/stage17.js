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

  generateArchetypes(ventureId, supabase, { signal: ac.signal })
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
  const { screenId, platform, artifactId } = req.body || {};

  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }
  if (!screenId || typeof screenId !== 'string') {
    return res.status(400).json({ error: 'screenId is required', code: 'MISSING_SCREEN_ID' });
  }
  if (!platform || !['mobile', 'desktop'].includes(platform)) {
    return res.status(400).json({ error: 'platform must be "mobile" or "desktop"', code: 'INVALID_PLATFORM' });
  }
  if (!artifactId || typeof artifactId !== 'string') {
    return res.status(400).json({ error: 'artifactId is required', code: 'MISSING_ARTIFACT_ID' });
  }

  const supabase = req.app.locals.supabase || req.supabase;
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
 * POST /api/stage17/:ventureId/approve — Check completion
 */
router.post('/:ventureId/approve', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;
  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }

  const supabase = req.app.locals.supabase || req.supabase;
  try {
    const result = await isDesignPassComplete(ventureId, supabase);
    return res.status(200).json(result);
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
