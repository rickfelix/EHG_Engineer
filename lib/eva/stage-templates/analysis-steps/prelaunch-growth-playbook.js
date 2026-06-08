/**
 * Pre-launch Growth Playbook co-output
 * SD: SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-D (FR-004)
 *
 * Generates a Growth Playbook BEFORE launch, as a NULL-SAFE, IDEMPOTENT co-output
 * of the stage-21 Distribution run (analyzeStage22Distribution), so the S23 launch
 * kill-gate (FR-005) can validate growth strategy before authorizing launch instead
 * of discovering it only at the terminal stage 26.
 *
 * WHY a co-output and not a new stage: the venture lifecycle is fixed at
 * stage_number 1..26 (no inserts), and stage 21 already dispatches the Distribution
 * analyzer. So the pre-launch playbook rides the Distribution stage as a secondary
 * emission, mirroring the stage-16 positioning-brief co-output pattern. Stage 26's
 * canonical (post-launch, terminal) Growth Playbook in stage-26-growth-playbook.js
 * is intentionally left UNCHANGED — this module owns only the pre-launch artifact.
 *
 * Safety contract (the Distribution run must never break because of this):
 *   - null-safe: missing pre-launch upstream => no_data SKIP, never a fabricated playbook;
 *   - idempotent: a venture already holding an is_current=true growth_playbook is skipped;
 *   - persistence is best-effort and the public entrypoint never throws.
 *
 * No DDL: growth_playbook + growth_optimization_roadmap artifact types pre-exist in
 * lib/eva/artifact-types.js + the venture_artifacts CHECK constraint.
 *
 * @module lib/eva/stage-templates/analysis-steps/prelaunch-growth-playbook
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';

// The pre-launch playbook is emitted at the Distribution stage (21), matching where
// persistCanonicalPair writes the distribution artifacts the S23 gate reads.
export const PRELAUNCH_STAGE = 21;

const SYSTEM_PROMPT = `You are EVA's Growth Strategist. Generate a PRE-LAUNCH growth playbook from go-to-market strategy, target personas, pricing, and the configured distribution channels. This is a forward-looking plan to be validated at the launch readiness gate — base it on planned strategy, not post-launch metrics.

Output valid JSON:
{
  "growth_experiments": [
    { "name": "Experiment name", "hypothesis": "If we X, then Y", "metric": "What to measure", "priority": "high|medium|low" }
  ],
  "scaling_priorities": [
    { "area": "Area to scale", "current_state": "Where we are pre-launch", "target_state": "Where we need to be", "timeline": "When" }
  ],
  "operations_handoff": {
    "monitoring_dashboards": ["Dashboard 1"],
    "alert_thresholds": ["Alert 1"],
    "runbooks": ["Runbook 1"],
    "escalation_path": "Who to contact"
  },
  "90_day_plan": {
    "month_1": "Focus area",
    "month_2": "Focus area",
    "month_3": "Focus area"
  }
}`;

/**
 * Pure helper. Classifies the no-data / skip reason for the pre-launch playbook.
 *   - 'already_generated'        an is_current=true growth_playbook already exists (idempotency)
 *   - 'missing_prelaunch_upstream' neither GTM strategy nor persona context is present
 *   - null                        OK to proceed
 *
 * @param {{ existingCurrentPlaybook?: boolean, gtm?: Object, persona?: Object }} params
 * @returns {string|null}
 */
export function classifyPrelaunchNoDataReason({ existingCurrentPlaybook, gtm, persona } = {}) {
  if (existingCurrentPlaybook) return 'already_generated';
  const hasObj = (o) => o && typeof o === 'object' && Object.keys(o).length > 0;
  if (!hasObj(gtm) && !hasObj(persona)) return 'missing_prelaunch_upstream';
  return null;
}

/**
 * Pure helper. Splits a growth playbook result into the canonical pair payloads
 * (growth_playbook + growth_optimization_roadmap), matching the shape stage 26 emits.
 */
export function splitGrowthArtifacts(result, ventureName) {
  return {
    playbookPayload: {
      growth_experiments: result.growth_experiments || [],
      operations_handoff: result.operations_handoff || {},
      '90_day_plan': result['90_day_plan'] || {},
      venture_name: ventureName,
      phase: 'pre_launch',
    },
    roadmapPayload: {
      scaling_priorities: result.scaling_priorities || [],
      '90_day_plan': result['90_day_plan'] || {},
      venture_name: ventureName,
      phase: 'pre_launch',
    },
  };
}

export function buildFallbackPrelaunch(_ventureName) {
  return {
    growth_experiments: [
      { name: 'Launch referral incentive', hypothesis: 'Referrals lift early signups 15%', metric: 'referral_signups', priority: 'high' },
      { name: 'Channel A/B test', hypothesis: 'Top GTM channel outperforms on CAC', metric: 'cac_by_channel', priority: 'medium' },
    ],
    scaling_priorities: [
      { area: 'Acquisition', current_state: 'Pre-launch / no traffic', target_state: 'Validated primary channel', timeline: '90 days' },
    ],
    operations_handoff: {
      monitoring_dashboards: ['Acquisition funnel', 'Activation rate'],
      alert_thresholds: ['Signup conversion < 2%', 'CAC > target'],
      runbooks: ['Launch-day monitoring', 'Channel pause/scale'],
      escalation_path: 'Chairman via EHG dashboard',
    },
    '90_day_plan': { month_1: 'Validate primary channel', month_2: 'Optimize activation', month_3: 'Scale winning channel' },
  };
}

/**
 * Generate the pre-launch growth playbook from pre-launch context. LLM with a
 * deterministic fallback (mirrors the other analysis steps). Never throws.
 *
 * @param {{ context?: Object, ventureName?: string, logger?: Object }} params
 * @returns {Promise<{ result: Object, usage: Object }>}
 */
export async function generatePrelaunchGrowthPlaybook({ context = {}, ventureName, logger = console } = {}) {
  let result;
  let usage = {};
  try {
    const client = getLLMClient();
    const response = await client.complete(
      SYSTEM_PROMPT,
      `Generate a pre-launch growth playbook for ${ventureName}.\nPre-launch context:\n${JSON.stringify(context, null, 2)}`
    );
    const parsed = parseJSON(response);
    usage = extractUsage(response) || {};
    result = parsed?.growth_experiments ? parsed : buildFallbackPrelaunch(ventureName);
  } catch (err) {
    logger.warn?.(`[S21-PrelaunchGrowth] LLM error, using fallback: ${err.message}`);
    result = buildFallbackPrelaunch(ventureName);
  }
  return { result, usage };
}

/**
 * Idempotency probe: does the venture already hold an is_current=true growth_playbook
 * (at any lifecycle_stage)? Treated as "ok, skip" on DB error (fail-safe: never block
 * the Distribution run, and never duplicate).
 */
export async function hasCurrentGrowthPlaybook(supabase, ventureId, logger = console) {
  if (!supabase || !ventureId) return false;
  try {
    const { data, error } = await supabase
      .from('venture_artifacts')
      .select('id')
      .eq('venture_id', ventureId)
      .eq('artifact_type', 'growth_playbook')
      .eq('is_current', true)
      .limit(1);
    if (error) {
      logger.warn?.(`[S21-PrelaunchGrowth] idempotency probe error (treating as exists, skipping): ${error.message}`);
      return true; // fail-safe: do not generate if we cannot confirm absence
    }
    return (data || []).length > 0;
  } catch (err) {
    logger.warn?.(`[S21-PrelaunchGrowth] idempotency probe threw (skipping): ${err.message}`);
    return true;
  }
}

/**
 * Persist the canonical growth pair at PRELAUNCH_STAGE, is_current=true, marking any
 * prior current rows of the same type stale first. Best-effort; returns a summary.
 */
export async function persistPrelaunchGrowthPlaybook(supabase, ventureId, result, ventureName, logger = console) {
  if (!supabase || !ventureId) return { persisted: false, reason: 'no_supabase_or_ventureId' };
  const { playbookPayload, roadmapPayload } = splitGrowthArtifacts(result, ventureName);
  const baseTitle = `Growth Playbook (pre-launch) — ${ventureName}`;
  const writes = [
    { artifact_type: 'growth_playbook', title: baseTitle, artifact_data: playbookPayload },
    { artifact_type: 'growth_optimization_roadmap', title: `${baseTitle} (Roadmap)`, artifact_data: roadmapPayload },
  ];
  const persisted = [];
  for (const w of writes) {
    const { error: e1 } = await supabase
      .from('venture_artifacts')
      .update({ is_current: false, updated_at: new Date().toISOString() })
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', PRELAUNCH_STAGE)
      .eq('artifact_type', w.artifact_type)
      .eq('is_current', true);
    if (e1) {
      // Skip the insert if mark-stale failed: inserting anyway could leave TWO
      // is_current=true rows of the same type, violating the single-current invariant
      // the S23 gate + idempotency probe rely on. Better to under-persist (a later run
      // re-generates) than to corrupt the current-row invariant.
      logger.warn?.(`[S21-PrelaunchGrowth] mark-stale error on ${w.artifact_type}, skipping insert to avoid duplicate is_current row: ${e1.message}`);
      continue;
    }

    const { error: e2 } = await supabase
      .from('venture_artifacts')
      .insert({
        venture_id: ventureId,
        lifecycle_stage: PRELAUNCH_STAGE,
        artifact_type: w.artifact_type,
        title: w.title, // venture_artifacts.title is NOT NULL
        is_current: true,
        source: 'worker_sd_leo_feat_post_build_lifecycle_001_d',
        artifact_data: w.artifact_data,
      });
    if (e2) logger.warn?.(`[S21-PrelaunchGrowth] insert error on ${w.artifact_type}: ${e2.message}`);
    else persisted.push(w.artifact_type);
  }
  return { persisted: persisted.length > 0, types: persisted };
}

/**
 * Public entrypoint — the Distribution analyzer calls this after persisting its own
 * canonical pair. NULL-SAFE + IDEMPOTENT, and NEVER throws (the Distribution run's
 * output must be unaffected by any failure here).
 *
 * @returns {Promise<{ status: 'ok'|'no_data'|'skipped', reason?: string, types?: string[] }>}
 */
export async function runPrelaunchGrowthCoOutput({ supabase, ventureId, ventureName, context = {}, logger = console } = {}) {
  try {
    const existingCurrentPlaybook = await hasCurrentGrowthPlaybook(supabase, ventureId, logger);
    const reason = classifyPrelaunchNoDataReason({
      existingCurrentPlaybook,
      gtm: context.gtm_strategy,
      persona: context.personas,
    });
    if (reason) {
      logger.info?.(`[S21-PrelaunchGrowth] skip for ${ventureName || 'unknown'}: reason=${reason}`);
      return { status: 'no_data', reason };
    }

    const { result } = await generatePrelaunchGrowthPlaybook({ context, ventureName, logger });
    const { persisted, types } = await persistPrelaunchGrowthPlaybook(supabase, ventureId, result, ventureName, logger);
    return persisted ? { status: 'ok', types } : { status: 'skipped', reason: 'persist_failed' };
  } catch (err) {
    logger.warn?.(`[S21-PrelaunchGrowth] co-output failed (non-blocking): ${err.message}`);
    return { status: 'skipped', reason: 'unexpected_error' };
  }
}

// Internal helpers exported for unit testing only.
export const _testing = { classifyPrelaunchNoDataReason, splitGrowthArtifacts, buildFallbackPrelaunch };
