/**
 * Review-gate mint — daemon-parity for the MANUAL stage-execution path.
 *
 * SD-LEO-INFRA-RUN-STAGE-MINT-REVIEW-GATES-001
 *
 * The EVA stage-execution DAEMON (lib/eva/stage-execution-worker.js ~1129-1157) mints a
 * pending review chairman_decision when it completes a review stage, so that
 * fn_advance_venture_stage can only advance past the stage once the chairman approves it
 * (otherwise it returns `review_gate_blocked`).
 *
 * The MANUAL path (scripts/eva/run-stage.js -> executeStage() in stage-execution-engine.js)
 * did NOT mint that decision, so a manual advance past a review stage was permanently
 * blocked. This helper closes the parity gap by reusing the SAME shared helper the daemon
 * uses (createOrReusePendingDecision from chairman-decision-watcher.js) — never a
 * hand-rolled INSERT — so the minted decision inherits the full daemon shape
 * (resolveDecisionHealth's non-null health_score + recordForwardGateScore advisory).
 *
 * The review-stage set comes from the canonical source the daemon reads
 * (getStageGovernance().isReview, backed by venture_stages.review_mode='review') — never a
 * hardcoded [7,8,9,11]. The mint is idempotent (the shared helper reuses an existing pending
 * decision), scoped (review stage + valid + non-dryRun), and FAIL-SOFT: any error is logged
 * and swallowed — the mint is a parity side-effect, never the stage's product, so it MUST
 * NEVER break the run. Deps are injectable for unit testing without a live DB.
 */
import { getStageGovernance as defaultGetStageGovernance } from './stage-governance.js';
import { createOrReusePendingDecision as defaultCreateOrReusePendingDecision } from './chairman-decision-watcher.js';

/**
 * Mint (or reuse) the pending review chairman_decision for a just-completed stage, mirroring
 * the daemon. Fail-soft — returns a `{minted, reason?}` result and never throws.
 *
 * @param {object} params
 * @param {object} params.supabase           Supabase client (required to do anything).
 * @param {string} params.ventureId          Venture id.
 * @param {number} params.stageNumber         Stage that just completed.
 * @param {boolean} params.validationValid    Whether the stage's validation passed.
 * @param {boolean} params.dryRun             Dry-run runs never mint.
 * @param {object} [params.logger=console]    Logger.
 * @param {object} [deps]                     Injectable deps (getStageGovernance, createOrReusePendingDecision).
 * @returns {Promise<{minted:boolean, decisionId?:string, isNew?:boolean, reason?:string, error?:string}>}
 */
export async function maybeMintReviewGate(
  { supabase, ventureId, stageNumber, validationValid, dryRun, logger = console },
  deps = {},
) {
  const getStageGovernance = deps.getStageGovernance || defaultGetStageGovernance;
  const createOrReusePendingDecision = deps.createOrReusePendingDecision || defaultCreateOrReusePendingDecision;

  // Scope: only a non-dryRun, valid completion with a live client is eligible.
  if (dryRun) return { minted: false, reason: 'dry_run' };
  if (!validationValid) return { minted: false, reason: 'invalid_validation' };
  if (!supabase) return { minted: false, reason: 'no_supabase' };

  // Canonical review-stage source (the same one the daemon reads).
  let gov;
  try {
    gov = await getStageGovernance(supabase);
  } catch (govErr) {
    logger.warn?.(`[StageEngine] review-gate governance unavailable (non-fatal): ${govErr.message}`);
    return { minted: false, reason: 'governance_unavailable', error: govErr.message };
  }

  // Mirror the daemon gate: review stage AND not a blocking (hard) gate.
  const isReview = typeof gov?.isReview === 'function' && gov.isReview(stageNumber);
  const isBlocking = typeof gov?.isBlocking === 'function' && gov.isBlocking(stageNumber);
  if (!isReview || isBlocking) return { minted: false, reason: 'not_review_stage' };

  // Best-effort venture name for the decision brief (parity with the daemon's briefData).
  let ventureName = null;
  try {
    const { data } = await supabase.from('ventures').select('name').eq('id', ventureId).single();
    ventureName = data?.name || null;
  } catch {
    // non-fatal — the brief just omits the name
  }

  try {
    const res = await createOrReusePendingDecision({
      ventureId,
      stageNumber,
      decisionType: 'review',
      briefData: { stage: stageNumber, ventureName },
      summary: `Review: Stage ${stageNumber} complete for ${ventureName || ventureId}`,
      supabase,
      logger,
    });
    logger.log?.(
      `[StageEngine] review-gate decision ${res?.isNew ? 'minted' : 'reused'} (${res?.id}) for stage ${stageNumber}`,
    );
    return { minted: true, decisionId: res?.id, isNew: res?.isNew };
  } catch (mintErr) {
    logger.warn?.(`[StageEngine] review-gate mint failed (non-fatal): ${mintErr.message}`);
    return { minted: false, reason: 'mint_error', error: mintErr.message };
  }
}

export default { maybeMintReviewGate };
