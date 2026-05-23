/**
 * Stage 19 Replit Workflow API Routes
 *
 * Path: /api/stage19
 *
 * Endpoints:
 *   GET /:ventureId/replit-prompts — returns Plan Mode + per-feature prompts
 *                                    grounded in S18 marketing copy + S17 designs
 *
 * Architectural rationale (2026-04-28):
 * Before this route existed, the Stage 19 frontend (`BuildMethodSelector.tsx`)
 * built Replit prompts entirely client-side — duplicating logic that
 * `lib/eva/bridge/replit-format-strategies.js` already implemented. Two
 * implementations drifted: backend got the marketing-copy binding fix from
 * §0 Rule 7 of the pre-approval playbook; frontend was unaware. This route
 * makes the backend the single source of truth so the frontend just renders.
 *
 * @module server/routes/stage19
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/middleware/eva-error-handler.js';
import { isValidUuid } from '../middleware/validate.js';
import { formatReplitOptimized } from '../../lib/eva/bridge/replit-prompt-formatter.js';
import { writeArtifact } from '../../lib/eva/artifact-persistence-service.js';
import { ARTIFACT_TYPES } from '../../lib/eva/artifact-types.js';

const router = Router();

// SD-LEO-FEAT-STAGE-BUILD-REPLIT-001 / FR-3 — URL shape validators
const HTTPS_URL_RE = /^https:\/\/[^\s/$.?#].[^\s]*$/i;
const GITHUB_REPO_RE = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?$/i;

function validateRegistrationBody(body) {
  const errors = {};
  const repo_url = typeof body?.repo_url === 'string' ? body.repo_url.trim() : '';
  const deployment_url = typeof body?.deployment_url === 'string' ? body.deployment_url.trim() : '';
  if (!repo_url || !GITHUB_REPO_RE.test(repo_url)) {
    errors.repo_url = 'must be https://github.com/<owner>/<repo>';
  }
  if (!deployment_url || !HTTPS_URL_RE.test(deployment_url)) {
    errors.deployment_url = 'must be a valid https:// URL';
  }
  return { repo_url, deployment_url, errors };
}

/**
 * GET /api/stage19/:ventureId/replit-prompts
 *
 * Returns the Plan Mode prompt and per-feature prompts for a venture, ready
 * to display in Stage 19's Replit workflow UI. Both formats are grounded in
 * the chairman-approved S18 marketing copy via the `Binding contract` block
 * (per the §0 Rule 7 round-trip refinement on 2026-04-28).
 *
 * Response shape:
 * {
 *   ventureName: string,
 *   planPrompt: string,
 *   featurePrompts: [{ title, content, points, priority }],
 *   warnings?: string[],
 *   generatedAt: string,
 * }
 */
router.get('/:ventureId/replit-prompts', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;
  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }

  const scope = req.query.scope === 'wireframes' ? 'wireframes' : 'sprint';
  // SD-LEO-FEAT-STAGE-REPLIT-PROMPTS-001: ?mode=build-into is an advisory hint; the
  // formatter resolves the authoritative mode from the ventures.repo_url SSOT.
  const modeHint = req.query.mode === 'build-into' ? 'build-into' : undefined;

  try {
    const result = await formatReplitOptimized(ventureId, { scope, mode: modeHint });
    return res.status(200).json({
      ventureName: result.manifest?.ventureName || 'Venture',
      mode: result.manifest?.mode || 'create-new',
      planPrompt: result.planModePrompt?.content || '',
      featurePrompts: (result.featurePrompts || []).map((fp) => ({
        title: fp.title || fp.filename || 'Feature',
        content: fp.content || '',
        points: fp.storyPoints ?? 0,
        priority: fp.priority || 'medium',
      })),
      warnings: result.warnings || [],
      generatedAt: result.manifest?.exportedAt || new Date().toISOString(),
    });
  } catch (err) {
    console.error('[stage19-route] replit-prompts failed', JSON.stringify({
      ventureId,
      errorName: err?.name,
      errorMessage: err?.message,
      errorCode: err?.code,
    }));
    if (err?.stack) console.error('[stage19-route] stack:', err.stack);
    return res.status(500).json({
      error: err?.message || 'Failed to build Replit prompts',
      code: 'PROMPT_BUILD_FAILED',
    });
  }
}));

/**
 * POST /api/stage19/:ventureId/register-deployment
 *
 * SD-LEO-FEAT-STAGE-BUILD-REPLIT-001 / FR-3
 *
 * Registers Replit deployment + GitHub repo URLs for a venture and emits the
 * canonical `build_mvp_build` artifact (the "build is done" signal that the
 * Stage 19→20 exit-gate enforcer reads).
 *
 * Request body: { repo_url: string, deployment_url: string }
 *   repo_url       — must match https://github.com/<owner>/<repo>
 *   deployment_url — must be a valid https:// URL
 *
 * Behavior:
 *   1. Validate UUID + URL shapes (400 INVALID_VENTURE_ID / VALIDATION_FAILED).
 *   2. Upsert venture_resources columns repo_url + deployment_url
 *      (resource_type='replit_deployment', resource_identifier=deployment_url
 *      so the existing (venture_id, resource_type, resource_identifier) unique
 *      constraint provides idempotency on the deployment URL).
 *   3. Emit `build_mvp_build` artifact via artifact-persistence-service.writeArtifact;
 *      writeArtifact's is_current dedup makes the emit idempotent.
 *   4. Return 200 with the resource id, artifact id, and canonical URLs.
 */
router.post('/:ventureId/register-deployment', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;
  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }
  const { repo_url, deployment_url, errors } = validateRegistrationBody(req.body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      error: 'URL validation failed',
      code: 'VALIDATION_FAILED',
      invalid: Object.keys(errors),
      reason: errors,
    });
  }

  const supabase = req.app.locals.supabase;
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client unavailable', code: 'NO_SUPABASE' });
  }

  // Upsert venture_resources row using the existing unique key
  // (venture_id, resource_type, resource_identifier) for idempotency.
  const { data: resourceRow, error: upsertErr } = await supabase
    .from('venture_resources')
    .upsert({
      venture_id: ventureId,
      resource_type: 'replit_deployment',
      resource_identifier: deployment_url,
      provider: 'replit',
      status: 'active',
      repo_url,
      deployment_url,
    }, { onConflict: 'venture_id,resource_type,resource_identifier' })
    .select('id')
    .single();

  if (upsertErr) {
    console.error('[stage19-route] register-deployment upsert failed', upsertErr.message);
    return res.status(500).json({
      error: 'Failed to persist venture_resources',
      code: 'RESOURCE_UPSERT_FAILED',
      detail: upsertErr.message,
    });
  }

  // Emit build_mvp_build artifact (writeArtifact handles dedup via is_current).
  let artifactId;
  try {
    artifactId = await writeArtifact(supabase, {
      ventureId,
      lifecycleStage: 19,
      artifactType: ARTIFACT_TYPES.BUILD_MVP_BUILD,
      title: 'Replit deployment registered',
      artifactData: {
        repo_url,
        deployment_url,
        registered_at: new Date().toISOString(),
      },
      metadata: {
        registered_via: 'POST /api/stage19/:ventureId/register-deployment',
        repo_url,
        deployment_url,
      },
      source: 'stage19-register-deployment',
    });
  } catch (err) {
    console.error('[stage19-route] build_mvp_build emit failed', err.message);
    return res.status(500).json({
      error: 'venture_resources persisted but artifact emit failed',
      code: 'ARTIFACT_EMIT_FAILED',
      detail: err.message,
      resource_id: resourceRow?.id,
    });
  }

  return res.status(200).json({
    ventureId,
    repo_url,
    deployment_url,
    resource_id: resourceRow?.id,
    artifact_id: artifactId,
    artifact_type: ARTIFACT_TYPES.BUILD_MVP_BUILD,
  });
}));

export default router;
