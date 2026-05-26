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
import { resolveRepoReadiness } from '../../lib/eva/bridge/repo-readiness.js';
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
 * Returns the Claude-Code-ready readiness summary for a venture's Stage 19 build.
 * SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-E retired the paste-into-Replit-Agent
 * prompts payload (planPrompt + per-feature prompts): the ehg S19 UI (Child D) now
 * consumes `readiness`, and Claude Code builds the features from the seeded repo
 * (CLAUDE.md + docs/build-tasks.md) rather than from pasted prompts.
 *
 * Response shape:
 * {
 *   ventureName: string,
 *   mode: string,
 *   warnings?: string[],
 *   generatedAt: string,
 *   readiness: { repoReady: boolean, seededArtifacts: string[], buildPlanSummary: object },
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
    // SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-E: the paste-into-Replit-Agent prompts
    // payload (planPrompt + featurePrompts) has been retired — the ehg S19 UI (Child D)
    // consumes the readiness contract instead, and Claude Code builds from the seeded
    // repo. The route now returns venture identity + readiness. resolveRepoReadiness
    // never throws.
    const readiness = await resolveRepoReadiness(ventureId);
    return res.status(200).json({
      ventureName: result.manifest?.ventureName || 'Venture',
      mode: result.manifest?.mode || 'create-new',
      warnings: result.warnings || [],
      generatedAt: result.manifest?.exportedAt || new Date().toISOString(),
      readiness,
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

  // register-deployment performs privileged canonical writes — the venture_resources
  // upsert + the build_mvp_build artifact the Stage 19->20 readiness contract reads.
  // venture_resources RLS permits writes for service_role only (no authenticated
  // INSERT/UPDATE policy) and the per-request authed client (req.supabase) is SELECT-only
  // here, so use a service-role client (mirrors the master-reset route). The auth
  // middleware has already authenticated the caller (req.user) before this handler runs.
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Supabase client unavailable', code: 'NO_SUPABASE' });
  }
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

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

  // SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 / FR-4: the "build is done" signal must be
  // EVIDENCE-BASED, not asserted. Registering a deployment URL records the build PLAN total
  // but does NOT by itself prove the build is complete — build_tasks_complete now defaults to
  // null (unverified) rather than the total. Only an explicit, verified build_tasks_complete in
  // the request body is honored. The S19->S20 exit gate (verifyBuildMvpBuildPresent) and the S20
  // Code Quality Gate enforce real completion downstream.
  //   Superseded prior behavior (SD-LEO-FEAT-FINALIZE-CLAUDE-CODE-001 / FR-3): complete fell back
  //   to the total, so a bare register-deployment asserted an unverified N/N (e.g. CronLinter 7/7).
  // Degrade-safe — resolveRepoReadiness never throws.
  let buildTasksTotal = null;
  let buildTasksComplete = null;
  try {
    const readiness = await resolveRepoReadiness(ventureId, { supabase });
    const total = readiness?.buildPlanSummary?.featureTaskCount;
    if (Number.isFinite(total)) {
      buildTasksTotal = total;
      const reported = Number(req.body?.build_tasks_complete);
      buildTasksComplete = Number.isFinite(reported) ? Math.max(0, Math.min(reported, total)) : null;
    }
  } catch { /* degrade-safe: omit the completion fields entirely */ }

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
        ...(buildTasksTotal !== null
          ? {
              build_tasks_total: buildTasksTotal,
              build_tasks_complete: buildTasksComplete,
              // FR-4: explicit provenance — true only when a verified completion count
              // (>= total) was supplied. A bare register-deployment leaves this false.
              build_completion_verified:
                buildTasksComplete !== null && buildTasksComplete >= buildTasksTotal,
            }
          : {}),
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
