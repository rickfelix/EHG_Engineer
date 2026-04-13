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

const router = Router();

/** Max length for the projectId string parameter (defensive, not from any DB constraint) */
const MAX_PROJECT_ID_LENGTH = 256;

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

export default router;
