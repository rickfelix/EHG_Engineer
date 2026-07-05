/**
 * S19->S20 Post-Build Convergence Gate — wires Child C's convergence loop
 * (lib/eva/convergence-loop.js runConvergenceLoop) into the real venture-build
 * pipeline. SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-D.
 *
 * Scoped to convergence-subject leo_bridge ventures only (isConvergenceSubject) so
 * every other venture's S19->S20 transition is provably unaffected — the reverse-
 * starvation guardrail the parent SD's LEAD risk review required. Feature-flag
 * gated (POST_BUILD_CONVERGENCE_GATE_ENABLED, default enabled) for a zero-code-change
 * rollback path. Non-blocking by design: this gate never sets releaseState/blocks the
 * S19->S20 transition — it scores, persists, and loudly flags, exactly like the
 * chairman product-review packet it feeds ("machine diff beside the human taste-test,
 * not a replacement").
 *
 * QF-20260705-633: createQuickFixFn/createSdFn are now wired via
 * lib/eva/convergence-remediation-writers.js (minimal DB-insert-only writers,
 * NOT the full CLI creation paths -- those also create git branches/worktrees as a
 * side effect and have no safe importable entry point). backfillFn for completeness
 * gaps remains unwired: it needs genuine upstream-artifact-reader design (which
 * planning document backs which dimension), tracked as a separate follow-up. An
 * unremediated completeness gap still fails safe into deferred/errors (never
 * silently dropped) and surfaces via the ESCALATED chairman_decisions flag.
 */
import { isConvergenceSubject } from './clean-clone/launch.js';
import { runConvergenceLoop } from './convergence-loop.js';
import { requestProductReview } from './chairman-product-review.js';
import { createQuickFixWriter, createSdWriter } from './convergence-remediation-writers.js';

// Shares S20PauseController's venture_stage_work(venture_id, lifecycle_stage=20) row —
// the summary rides alongside pause_state in the same advisory_data JSONB column.
export const POST_BUILD_CONVERGENCE_GATE_STAGE = 20;

/** Pure: is the gate enabled? Fail-open default (enabled) — an unset/malformed env var never silently disables the gate. */
export function isPostBuildConvergenceGateEnabled(env = process.env) {
  return env.POST_BUILD_CONVERGENCE_GATE_ENABLED !== 'false';
}

/**
 * Persist the convergence verdict summary into the SAME venture_stage_work row
 * S20PauseController reads/writes — merge-safe (reads existing advisory_data first),
 * so it never clobbers pause_state, and preserves any existing stage_status rather
 * than forcing one.
 * @param {Object} supabase
 * @param {string} ventureId
 * @param {object} summary
 */
export async function persistVerdictSummary(supabase, ventureId, summary) {
  const { data: existing } = await supabase
    .from('venture_stage_work')
    .select('advisory_data, stage_status')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', POST_BUILD_CONVERGENCE_GATE_STAGE)
    .maybeSingle();
  const advisoryData = { ...(existing?.advisory_data || {}), post_build_verdict: summary };
  await supabase
    .from('venture_stage_work')
    .upsert({
      venture_id: ventureId,
      lifecycle_stage: POST_BUILD_CONVERGENCE_GATE_STAGE,
      stage_status: existing?.stage_status || 'blocked',
      work_type: 'sd_required',
      advisory_data: advisoryData,
    }, { onConflict: 'venture_id,lifecycle_stage' });
}

/**
 * Read the persisted verdict summary (for consumers that only read — e.g. the
 * chairman product-review packet).
 * @param {Object} supabase
 * @param {string} ventureId
 * @returns {Promise<object|null>}
 */
export async function loadVerdictSummary(supabase, ventureId) {
  try {
    const { data } = await supabase
      .from('venture_stage_work')
      .select('advisory_data')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', POST_BUILD_CONVERGENCE_GATE_STAGE)
      .maybeSingle();
    return data?.advisory_data?.post_build_verdict || null;
  } catch {
    return null;
  }
}

/**
 * Run the S19 exit convergence check for a venture. No-op (applicable:false) for any
 * venture that is not a convergence subject, or when the feature flag is disabled, or
 * on any internal error — all three fail TOWARD the existing S19->S20 behavior, never
 * toward blocking it.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @param {{logger?: {log: Function, warn: Function}}} [opts]
 * @returns {Promise<{applicable: boolean, status?: 'PASS'|'ESCALATED', adherenceScore?: number, escalated?: boolean, reason?: string}>}
 */
export async function runS19ConvergenceGate(supabase, ventureId, opts = {}) {
  const logger = opts.logger || console;

  if (!isPostBuildConvergenceGateEnabled()) {
    return { applicable: false, reason: 'flag_disabled' };
  }

  let subject = false;
  try {
    subject = await isConvergenceSubject(supabase, ventureId);
  } catch (e) {
    logger.warn?.(`[PostBuildConvergenceGate] isConvergenceSubject check failed (fail-open, not applicable): ${e.message}`);
    return { applicable: false, reason: 'convergence_subject_check_failed' };
  }
  if (!subject) {
    return { applicable: false, reason: 'not_convergence_subject' };
  }

  let loopResult;
  try {
    loopResult = await runConvergenceLoop(supabase, {
      ventureId,
      createQuickFixFn: createQuickFixWriter(supabase),
      createSdFn: createSdWriter(),
    });
  } catch (e) {
    logger.warn?.(`[PostBuildConvergenceGate] runConvergenceLoop threw (fail-open, non-blocking): ${e.message}`);
    return { applicable: false, reason: 'convergence_loop_error' };
  }

  const { status, scoreResult, cycles } = loopResult;
  const summary = {
    status,
    adherence_score: scoreResult.mean,
    dimension_scores: scoreResult.dimensionScores,
    unscored_dimensions: scoreResult.unscoredDimensions,
    dimension_floor: scoreResult.rubric?.dimension_floor ?? null,
    cycles,
    escalated: status === 'ESCALATED',
    scored_at: new Date().toISOString(),
  };

  try {
    await persistVerdictSummary(supabase, ventureId, summary);
  } catch (e) {
    logger.warn?.(`[PostBuildConvergenceGate] verdict persistence failed (non-fatal): ${e.message}`);
  }

  if (status === 'ESCALATED') {
    try {
      // Reuses the existing chairman_decisions escalation surface (requestProductReview),
      // which now carries verdictTable/adherenceScore/belowThreshold via the extended
      // generateReviewPacket() — no new notification channel (FR-4).
      await requestProductReview(supabase, ventureId, logger);
    } catch (e) {
      logger.warn?.(`[PostBuildConvergenceGate] loud below-threshold flag (requestProductReview) failed (non-fatal): ${e.message}`);
    }
  }

  return { applicable: true, status, adherenceScore: scoreResult.mean, escalated: status === 'ESCALATED' };
}

export default {
  POST_BUILD_CONVERGENCE_GATE_STAGE,
  isPostBuildConvergenceGateEnabled,
  persistVerdictSummary,
  loadVerdictSummary,
  runS19ConvergenceGate,
};
