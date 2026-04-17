/**
 * Stitch Export API Routes
 *
 * SD: SD-LEO-ORCH-STAGE-STITCH-DESIGN-001-B (Frontend Trigger)
 * Wraps the lib/eva/bridge/stitch-exporter.js module shipped in child A
 * (SD-LEO-ORCH-STAGE-STITCH-DESIGN-001-A, PR #2861).
 *
 * The route is the single authenticated entry point for chairman-initiated
 * Stitch design exports from the EHG frontend. The exporter handles its own
 * graceful degradation; this route returns the manifest verbatim with HTTP 200
 * even when manifest.status indicates a degraded state — the frontend decides
 * how to surface that state to the user.
 *
 * @module server/routes/stitch
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/middleware/eva-error-handler.js';
import { isValidUuid } from '../middleware/validate.js';
import { exportStitchArtifacts } from '../../lib/eva/bridge/stitch-exporter.js';
import { getVentureMetrics, getFleetHealth, detectDegradation } from '../../lib/eva/bridge/stitch-metrics.js';
import { checkCurationStatus } from '../../lib/eva/bridge/stitch-provisioner.js';
import { generateArchetypes, ArchetypeGenerationError } from '../../lib/eva/stage-17/archetype-generator.js';
import { submitPass1Selection, submitPass2Selection, isDesignPassComplete, SelectionError } from '../../lib/eva/stage-17/selection-flow.js';
import { runQARubric, uploadToGitHub, UploadError } from '../../lib/eva/stage-17/qa-rubric.js';

const router = Router();

/** Max length for the projectId string parameter (defensive, not from any DB constraint) */
const MAX_PROJECT_ID_LENGTH = 256;

/** Per-venture rate limiter for check-curation endpoint (1 call per 10s per venture) */
const curationRateLimiter = new Map();
const RATE_LIMIT_TTL_MS = 10_000;

/** Hard request timeout for the export call (60s). Exporter is async + may invoke external Stitch API. */
const EXPORT_TIMEOUT_MS = 60_000;

/**
 * Sanitize an error message before returning it to a client.
 * Strips file paths, env-var-shaped tokens, stack traces, and over-long content.
 *
 * @param {string|undefined} message
 * @returns {string}
 */
function sanitizeErrorMessage(message) {
  if (!message || typeof message !== 'string') return 'Export failed';
  let sanitized = message
    // Strip absolute Windows + Unix file paths
    .replace(/[A-Za-z]:[\\/][^\s)'"]+/g, '<path>')
    .replace(/\/(?:home|Users|var|opt|etc)\/[^\s)'"]+/g, '<path>')
    // Strip env-var-shaped uppercase tokens (12+ chars all caps with underscores)
    .replace(/\b[A-Z][A-Z0-9_]{11,}\b/g, '<env>')
    // Strip stack-trace lines after the first message line
    .split('\n')[0]
    .trim();
  if (sanitized.length > 500) sanitized = sanitized.substring(0, 500) + '…';
  return sanitized || 'Export failed';
}

/**
 * Run a promise with a hard timeout. Resolves with the promise result OR rejects
 * with a TimeoutError after the deadline. The underlying work continues but its
 * result is no longer awaited.
 */
function withTimeout(promise, ms, label = 'operation') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.code = 'TIMEOUT';
      reject(err);
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

/**
 * POST /api/stitch/:ventureId/check-curation
 *
 * Triggers backend verification of Stitch screen generation status.
 * Calls checkCurationStatus() which queries the Stitch API via listScreens(),
 * updates the venture_artifacts curation record, and returns current state.
 *
 * Auth: requireAuth (mounted in server/index.js)
 * Rate limit: 1 call per 10s per venture
 *
 * Returns:
 *   200 { ready, screen_count, ... }  — curation status from Stitch API
 *   400 { error, code }               — invalid ventureId
 *   429 { error, code }               — rate limited
 *   500 { error, code }               — Stitch API or internal error
 *
 * SD: SD-WIRE-STITCH-CURATION-STATUS-ORCH-001-A
 */
router.post('/:ventureId/check-curation', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;

  if (!isValidUuid(ventureId)) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Invalid ventureId format. Expected UUID.',
      code: 'INVALID_VENTURE_ID',
    });
  }

  // Per-venture rate limiting
  const now = Date.now();
  const lastCall = curationRateLimiter.get(ventureId);
  if (lastCall && now - lastCall < RATE_LIMIT_TTL_MS) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limited. Try again in ${Math.ceil((RATE_LIMIT_TTL_MS - (now - lastCall)) / 1000)}s.`,
      code: 'RATE_LIMITED',
    });
  }
  curationRateLimiter.set(ventureId, now);

  try {
    const result = await checkCurationStatus(ventureId);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[stitch-route] check-curation failed:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: sanitizeErrorMessage(err?.message),
      code: 'CURATION_CHECK_FAILED',
    });
  }
}));

/**
 * POST /api/stitch/export
 *
 * Body: { ventureId: string (UUID), projectId: string }
 * Auth: requireAuth (mounted in server/index.js)
 *
 * Returns:
 *   200 { manifest }     — success or graceful-degradation manifest from the exporter
 *   400 { error, code }  — input validation failed
 *   504 { error, code }  — export exceeded EXPORT_TIMEOUT_MS
 *   500 { error, code }  — unexpected exception (sanitized)
 */
router.post('/export', asyncHandler(async (req, res) => {
  const { ventureId, projectId } = req.body || {};

  // Input validation
  if (!isValidUuid(ventureId)) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Invalid ventureId format. Expected UUID.',
      code: 'INVALID_VENTURE_ID',
    });
  }

  if (typeof projectId !== 'string' || projectId.length === 0 || projectId.length > MAX_PROJECT_ID_LENGTH) {
    return res.status(400).json({
      error: 'Validation failed',
      message: `Invalid projectId. Expected non-empty string up to ${MAX_PROJECT_ID_LENGTH} chars.`,
      code: 'INVALID_PROJECT_ID',
    });
  }

  // Invoke the exporter behind a hard timeout. The exporter never throws on
  // adapter / persistence failure (per its documented contract); it returns
  // { manifest, html_files, png_files, design_md_path }. We unwrap the
  // `manifest` field so the response shape is { manifest } — NOT { manifest:
  // { manifest, html_files, ... } } — and avoid leaking filesystem paths.
  // Throws are reserved for caller-error and unexpected exceptions, which we
  // map to 500.
  try {
    const result = await withTimeout(
      exportStitchArtifacts(ventureId, projectId, null, { persistTo: 'venture_artifacts' }),
      EXPORT_TIMEOUT_MS,
      'stitch export'
    );
    return res.status(200).json({ manifest: result.manifest });
  } catch (err) {
    if (err && err.code === 'TIMEOUT') {
      return res.status(504).json({
        error: 'Gateway Timeout',
        message: `Export did not complete within ${EXPORT_TIMEOUT_MS / 1000}s`,
        code: 'EXPORT_TIMEOUT',
      });
    }
    // Log the raw error server-side; return sanitized message to client.
    console.error('[stitch-route] export failed:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: sanitizeErrorMessage(err && (err.message || String(err))),
      code: 'EXPORT_FAILED',
    });
  }
}));

/**
 * GET /api/stitch/metrics/:ventureId
 * Returns aggregated Stitch generation metrics for a venture.
 * SD: SD-STITCH-GENERATION-OBSERVABILITY-AND-ORCH-001-C
 */
router.get('/metrics/:ventureId', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;
  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid venture ID' });
  }
  const days = parseInt(req.query.days || '30', 10);
  const metrics = await getVentureMetrics(ventureId, days);
  if (!metrics) {
    return res.json({ venture_id: ventureId, total_screens: 0, message: 'No metrics data' });
  }
  res.json(metrics);
}));

/**
 * GET /api/stitch/metrics
 * Returns fleet-wide Stitch health summary.
 */
router.get('/metrics', asyncHandler(async (_req, res) => {
  const [fleet, degraded] = await Promise.all([
    getFleetHealth(7),
    detectDegradation()
  ]);
  res.json({ fleet, degraded_ventures: degraded });
}));

/**
 * POST /api/stitch/seed-repo
 * Seeds a GitHub repo with venture docs for Replit Agent build.
 * Body: { ventureId, repoUrl }
 */
router.post('/seed-repo', asyncHandler(async (req, res) => {
  const { ventureId, repoUrl } = req.body;
  if (!ventureId || !repoUrl) {
    return res.status(400).json({ error: 'ventureId and repoUrl are required' });
  }

  try {
    const { seedRepo } = await import('../../lib/eva/bridge/replit-repo-seeder.js');
    const result = await seedRepo(ventureId, repoUrl);
    res.json(result);
  } catch (err) {
    console.error('[stitch-route] seed-repo failed:', err);
    res.status(500).json({ error: err.message, code: 'SEED_FAILED' });
  }
}));

// ── Stage 17 Design Refinement Endpoints ────────────────────────────────────
// SD-FIX-S17-WIRING-GAPS-ORCH-001-A: Wire 4 orphaned S17 modules into production API path.
// Auth is applied at the router mount level (requireAuth in server/index.js).

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
  for (const [key, ts] of curationRateLimiter) {
    if (now - ts > RATE_LIMIT_TTL_MS) curationRateLimiter.delete(key);
  }
}, 60_000).unref();

/**
 * POST /api/stitch/:ventureId/stage17/archetypes
 *
 * Generates 6 HTML design archetypes per screen by invoking archetype-generator.js.
 * Rate-limited to 1 call per 10s per venture (generation is expensive — Claude API calls).
 *
 * Returns:
 *   200 { screenCount, artifactIds }
 *   400 { error, code } — invalid ventureId or missing source artifacts
 *   429 { error, code, retryAfter } — rate limited
 *   500 { error, code } — generation error
 *
 * SD-FIX-S17-WIRING-GAPS-ORCH-001-A (US-001, US-008)
 */
router.post('/:ventureId/stage17/archetypes', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;

  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }

  // Per-venture rate limiting
  const now = Date.now();
  const lastCall = archetypeRateLimiter.get(ventureId);
  if (lastCall && now - lastCall < ARCHETYPE_RATE_LIMIT_TTL_MS) {
    const retryAfter = Math.ceil((ARCHETYPE_RATE_LIMIT_TTL_MS - (now - lastCall)) / 1000);
    return res.status(429).json({
      error: 'Too Many Requests',
      code: 'RATE_LIMITED',
      retryAfter,
    });
  }
  archetypeRateLimiter.set(ventureId, now);

  const supabase = req.app.locals.supabase || req.supabase;

  // Fire-and-forget: return 202 immediately, run generation in background.
  // Each archetype is written to venture_artifacts as it completes — the frontend
  // polls the artifact count for progress. A synchronous response would timeout
  // (84 LLM calls × 30-60s each = 42-84 minutes).
  // Cancel any existing generation for this venture before starting a new one
  const existing = activeArchetypeGenerations.get(ventureId);
  if (existing) {
    existing.abort();
    console.info(`[stitch-route] Cancelled previous archetype generation for ${ventureId.slice(0, 8)}`);
  }

  const ac = new AbortController();
  activeArchetypeGenerations.set(ventureId, ac);

  res.status(202).json({ status: 'generating', message: 'Archetype generation started. Monitor progress via artifact count.' });

  generateArchetypes(ventureId, supabase, { signal: ac.signal })
    .then(result => {
      const label = result.cancelled ? 'cancelled' : 'complete';
      console.log(`[stitch-route] stage17/archetypes ${label}: ${result.artifactIds?.length ?? 0} archetypes for ${ventureId.slice(0, 8)}`);
    })
    .catch(err => {
      console.error('[stitch-route] stage17/archetypes background failed:', err.message ?? err);
    })
    .finally(() => {
      activeArchetypeGenerations.delete(ventureId);
    });
  return;
}));

/**
 * POST /api/stitch/:ventureId/stage17/archetypes/cancel
 *
 * Cancels an in-progress archetype generation for the given venture.
 * The generator checks the AbortSignal between screens, so cancellation
 * takes effect after the current screen finishes (up to ~7 min).
 *
 * Returns:
 *   200 { cancelled: true }  — generation was running and has been signalled to stop
 *   404 { cancelled: false } — no active generation found for this venture
 */
router.post('/:ventureId/stage17/archetypes/cancel', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;
  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }

  const ac = activeArchetypeGenerations.get(ventureId);
  if (ac) {
    ac.abort();
    activeArchetypeGenerations.delete(ventureId);
    console.info(`[stitch-route] Archetype generation cancelled for ${ventureId.slice(0, 8)}`);
    return res.json({ cancelled: true, message: 'Generation will stop after the current screen completes.' });
  }

  return res.status(404).json({ cancelled: false, message: 'No active archetype generation found for this venture.' });
}));

/**
 * POST /api/stitch/:ventureId/stage17/select
 *
 * Pass 1 selection: Chairman selects 2 of 6 archetypes → triggers 4 refined variants.
 * Body: { screenId: string, selectedIds: string[2] }
 *
 * Returns:
 *   200 { refinedArtifactIds: string[4] }
 *   400 { error, code } — validation error (wrong count, invalid IDs)
 *   500 { error, code }
 *
 * SD-FIX-S17-WIRING-GAPS-ORCH-001-A (US-002)
 */
router.post('/:ventureId/stage17/select', asyncHandler(async (req, res) => {
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
    console.error('[stitch-route] stage17/select failed:', err);
    return res.status(500).json({ error: sanitizeErrorMessage(err?.message), code: 'SELECT_ERROR' });
  }
}));

/**
 * POST /api/stitch/:ventureId/stage17/refine
 *
 * Pass 2 selection: Chairman picks final approved design from 4 refined variants.
 * Body: { screenId: string, platform: "mobile"|"desktop", artifactId: string }
 *
 * Returns:
 *   200 { approvedArtifactId: string }
 *   400 { error, code } — invalid platform or missing fields
 *   500 { error, code }
 *
 * SD-FIX-S17-WIRING-GAPS-ORCH-001-A (US-003)
 */
router.post('/:ventureId/stage17/refine', asyncHandler(async (req, res) => {
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
    return res.status(200).json({ approvedArtifactId: result });
  } catch (err) {
    if (err instanceof SelectionError) {
      return res.status(400).json({ error: err.message, code: 'SELECTION_ERROR' });
    }
    console.error('[stitch-route] stage17/refine failed:', err);
    return res.status(500).json({ error: sanitizeErrorMessage(err?.message), code: 'REFINE_ERROR' });
  }
}));

/**
 * POST /api/stitch/:ventureId/stage17/approve
 *
 * Checks whether all 14 design sessions (7 screens × 2 platforms) are complete.
 *
 * Returns:
 *   200 { complete: boolean, threshold: 14, current: number }
 *   400 { error, code } — invalid ventureId
 *   500 { error, code }
 *
 * SD-FIX-S17-WIRING-GAPS-ORCH-001-A (US-004)
 */
router.post('/:ventureId/stage17/approve', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;

  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }

  const supabase = req.app.locals.supabase || req.supabase;
  try {
    const result = await isDesignPassComplete(ventureId, supabase);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[stitch-route] stage17/approve failed:', err);
    return res.status(500).json({ error: sanitizeErrorMessage(err?.message), code: 'APPROVE_ERROR' });
  }
}));

/**
 * POST /api/stitch/:ventureId/stage17/qa
 *
 * Runs 3-layer QA rubric on all Stage 17 approved design artifacts.
 * Layer 1: Completeness (14/14 sessions approved)
 * Layer 2: HTML product spec validation
 * Layer 3: Brand token consistency vs locked manifest
 *
 * Returns:
 *   200 { layers, overallScore, counts }
 *   400 { error, code } — invalid ventureId
 *   500 { error, code }
 *
 * SD-FIX-S17-WIRING-GAPS-ORCH-001-A (US-005)
 */
router.post('/:ventureId/stage17/qa', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;

  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }

  const supabase = req.app.locals.supabase || req.supabase;
  try {
    const result = await runQARubric(ventureId, supabase);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[stitch-route] stage17/qa failed:', err);
    return res.status(500).json({ error: sanitizeErrorMessage(err?.message), code: 'QA_ERROR' });
  }
}));

/**
 * POST /api/stitch/:ventureId/stage17/upload
 *
 * Uploads all 14 approved HTML designs to the venture GitHub repository.
 * Blocks if HIGH-severity QA gaps exist (must pass QA first).
 * Validates HTML contains no external <script src="..."> (allow-same-origin sandbox policy).
 *
 * Returns:
 *   200 { filesUploaded, commitSha }
 *   400 { error, code, gaps } — blocked by QA gaps or script validation
 *   500 { error, code }
 *
 * SD-FIX-S17-WIRING-GAPS-ORCH-001-A (US-006)
 */
router.post('/:ventureId/stage17/upload', asyncHandler(async (req, res) => {
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
    console.error('[stitch-route] stage17/upload failed:', err);
    return res.status(500).json({ error: sanitizeErrorMessage(err?.message), code: 'UPLOAD_ERROR' });
  }
}));

export default router;
