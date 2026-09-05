/**
 * RCA_REQUIRED_AFTER_2_RETRIES gate — QF-20260830-657.
 *
 * MEASURED (7d, sd_phase_handoffs): 65 (sd_id, from_phase->to_phase) pairs with >2 attempts,
 * max 13, zero sub_agent_execution_results RCA rows for the max-attempt SD. CLAUDE.md's
 * "Canonical Pause Points" #3 ("Test failures after 2 retry attempts — auto-retry exhausted,
 * RCA sub-agent invoked before pause") exists only as prose: nothing in the handoff pipeline
 * counted attempts or checked for an RCA row.
 *
 * On the 3rd+ attempt at the SAME (sd_id, handoff_type) transition, this gate requires a
 * sub_agent_execution_results row (sub_agent_code='RCA') created AFTER the 2nd rejection.
 * Absent that row, it refuses with a named reason listing the two prior rejection reasons —
 * the permitted path is one RCA sub-agent call, not a hard block of the seat.
 *
 * Rollout (mirrors rca-feedback-loop-gate.js's app_config cutover convention — no redeploy
 * needed to flip modes): app_config key 'rca.required_after_retries.enforcement_mode'.
 *   advisory (default) — count + surface issues, never fails the gate.
 *   blocking            — refuses with RCA_REQUIRED_AFTER_2_RETRIES when the row is absent.
 *   disabled            — no-op, always passes.
 */
import { buildFailResult } from '../../../../lib/handoff/wait-verdict.js';

const GATE_NAME = 'RCA_REQUIRED_AFTER_2_RETRIES';
const CONFIG_KEY = 'rca.required_after_retries.enforcement_mode';

export async function readEnforcementMode(supabase) {
  if (!supabase) return 'advisory';
  try {
    const { data, error } = await supabase.from('app_config').select('value').eq('key', CONFIG_KEY).maybeSingle();
    if (error || !data || data.value == null) return 'advisory';
    let v = data.value;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { /* keep string */ } }
    return typeof v === 'string' && ['advisory', 'blocking', 'disabled'].includes(v.toLowerCase())
      ? v.toLowerCase() : 'advisory';
  } catch {
    return 'advisory';
  }
}

export function createRcaRequiredAfterRetriesGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      const sdId = ctx?.sd_id ?? ctx?.sdId;
      const handoffType = ctx?.handoffType;
      // SECURITY evidence da4de941 (SEC-1): this gate is REQUIRED on all 4 transitions with no
      // required:false opt-out. ValidationOrchestrator.validateGate converts an uncaught throw
      // into passed:false, which would fail CLOSED fleet-wide on every handoff -- the opposite
      // of the "fail-open on every DB read error" design intent stated throughout this file.
      // Wrapping the whole body guarantees that intent holds even against an error shape this
      // code doesn't already anticipate (not just the {data,error} pairs it explicitly checks).
      try {
        const mode = await readEnforcementMode(supabase);

        if (mode === 'disabled' || !supabase || !sdId || !handoffType) {
          return { passed: true, score: 100, issues: [], details: { mode, skipped: !sdId || !handoffType ? 'no-sd-or-type' : true } };
        }

        // count-truncation-diff-lint: bounded read. Fetches the REJECTIONS_CAP most recent
        // rejections (descending) then reverses to ascending -- attempt_index becomes a capped
        // approximation (measured max is 13; this repo's own gotcha memory: a capped count is
        // never claimed as an exact population count) but the anchor logic below only needs the
        // MOST RECENT rejection and the two most recent reasons, both of which the descending
        // fetch preserves exactly regardless of true total count.
        const { data: rejectionsDesc, error } = await supabase
          .from('sd_phase_handoffs')
          .select('rejection_reason, created_at')
          .eq('sd_id', sdId)
          .eq('handoff_type', handoffType)
          .eq('status', 'rejected')
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) {
          return { passed: true, score: 100, issues: [`rejection-read-error: ${error.message}`], details: { mode } };
        }
        const rejections = (rejectionsDesc || []).slice().reverse();

        const attemptIndex = (rejections?.length || 0) + 1;
        if (attemptIndex < 3) {
          return { passed: true, score: 100, issues: [], details: { mode, attempt_index: attemptIndex } };
        }

        // VALIDATION evidence 2013c6ad: anchor to the MOST RECENT rejection (not rejections[1],
        // the 2nd-ever) so a fresh retry cycle re-arms the requirement -- on attempt 3 this is
        // identical to the old anchor (only 2 rejections exist), but on attempt 5+ it correctly
        // requires a diagnosis of the LATEST failure instead of letting one RCA run satisfy the
        // gate forever after the 2nd rejection ever occurred.
        const mostRecentRejection = rejections[rejections.length - 1];
        // count-truncation-diff-lint: bounded read -- only existence (length > 0) and id list
        // are used, so a small cap is sufficient regardless of true total RCA-row count.
        // .order() added per EXEC-phase TESTING re-verify (evidence 28382f71): the content
        // predicate below makes WHICH 20 rows land in this sample decision-relevant in a way
        // bare existence never was.
        const { data: rcaRows, error: rcaError } = await supabase
          .from('sub_agent_execution_results')
          .select('id, created_at, metadata')
          .eq('sd_id', sdId)
          .eq('sub_agent_code', 'RCA')
          .gt('created_at', mostRecentRejection.created_at)
          .order('created_at', { ascending: false })
          .limit(20);
        if (rcaError) {
          return { passed: true, score: 100, issues: [`rca-read-error: ${rcaError.message}`], details: { mode, attempt_index: attemptIndex } };
        }

        // SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C (FR-C2): bare row-existence let a hollow/failed
        // RCA row (no real analysis) satisfy this gate identically to a genuine one. Require the
        // row's linked root_cause_reports (via metadata.rcr_id) to actually carry a non-empty
        // root_cause AND confidence >= 70 -- content-based, deliberately NOT status-based
        // (PLAN-phase TESTING review, evidence baded1f3: rca.js never writes status='RESOLVED').
        //
        // The floor is 70, NOT 60 (EXEC-phase confirmation round, evidence 79f84159/e78f2c71 --
        // both TESTING and SECURITY independently measured live data and found 60 empirically
        // vacuous: 0 of 1412 rows excluded, because resolveRcaDispatchTarget's auto-created RCR
        // leaves rca.js's identifyRootCause() four contributing factors (log_quality,
        // evidence_strength, pattern_match_score, historical_success_bonus) at their NULL
        // defaults, so the formula always computes exactly 65 for the templated, non-genuine
        // path this SD's own dispatch fix creates -- 513 of 520 passing rows share ONE
        // byte-identical templated root_cause at confidence 65; the 7 genuine analyses in the
        // dataset sit at 90-95. 70 is the measured discriminating threshold (matches rca.js's
        // own CAPA_PENDING cut and the DB's valid_confidence_for_status >=70 requirement) and
        // correctly excludes all 513 templated rows while keeping all 7 genuine ones. This is
        // still an evidence-QUALITY floor, not an access-control boundary -- confidence remains
        // a plain column an equally-privileged actor could set directly (SECURITY evidence
        // e78f2c71: "the trust model has not fundamentally changed"); it only raises the cost of
        // an accidental or lazy false-pass, which is the realistic failure mode this gate guards
        // against today (both RCA gates are advisory-mode by default; see below).
        //
        // SEC-1 (evidence c49ce1e0, confirmed closed by hostile-client re-verify e78f2c71): a
        // malformed (non-UUID) metadata.rcr_id used to hit a Postgres 22P02 error, landing in the
        // old rcrError fail-open branch -- making a malformed id CHEAPER to forge a pass with
        // than a well-formed-but-wrong one. Filter to well-formed UUIDs before querying; a
        // dropped malformed id is simply never verified (correctly non-satisfying), never a
        // query error. Lower-cased at extraction (SEC-5, evidence e78f2c71): Postgres returns
        // canonical lowercase uuid text, so an uppercase caller-supplied id must be normalized
        // before the final Set lookup below, or a genuine analysis goes uncredited.
        //
        // SEC-2 (evidence c49ce1e0, confirmed closed by hostile-client re-verify e78f2c71): the
        // RCR content lookup had no .eq('sd_id', sdId), so ANY rcr_id belonging to a completely
        // unrelated SD with a genuine analysis (519/1411 live rows qualify) was a universal
        // gate-passing token. Scoped to this SD's own RCRs only.
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const rcrIds = [...new Set(
          (rcaRows || [])
            .map((r) => r.metadata?.rcr_id)
            .filter((id) => typeof id === 'string' && UUID_REGEX.test(id))
            .map((id) => id.toLowerCase())
        )];
        let contentVerifiedIds = new Set();
        if (rcrIds.length > 0) {
          // count-truncation-diff-lint: bounded read -- rcrIds is already capped by the
          // upstream rcaRows query's own .limit(20) above; this explicit limit makes that bound
          // visible at this call site too, rather than relying on an implicit upstream cap.
          const { data: rcrRows, error: rcrError } = await supabase
            .from('root_cause_reports')
            .select('id, root_cause, confidence')
            .eq('sd_id', sdId)
            .in('id', rcrIds)
            .limit(20);
          if (rcrError) {
            return { passed: true, score: 100, issues: [`rcr-content-read-error: ${rcrError.message}`], details: { mode, attempt_index: attemptIndex } };
          }
          contentVerifiedIds = new Set(
            (rcrRows || [])
              .filter((r) => typeof r.root_cause === 'string' && r.root_cause.trim().length > 0 && (r.confidence ?? 0) >= 70)
              .map((r) => String(r.id).toLowerCase())
          );
        }
        const satisfyingRows = (rcaRows || []).filter(
          (r) => r.metadata?.rcr_id && contentVerifiedIds.has(String(r.metadata.rcr_id).toLowerCase())
        );

        const details = {
          mode,
          attempt_index: attemptIndex,
          rca_evidence: rcaRows?.map((r) => r.id) || [],
          content_verified_evidence: satisfyingRows.map((r) => r.id),
        };
        if (satisfyingRows.length > 0 || mode !== 'blocking') {
          return { passed: true, score: 100, issues: [], details };
        }

        const priorReasons = rejections.slice(-2).map((r) => r.rejection_reason || '(no reason recorded)');
        return buildFailResult({
          score: 0,
          max_score: 100,
          issues: [`RCA_REQUIRED_AFTER_2_RETRIES: attempt ${attemptIndex} on ${handoffType} — prior rejections: ${priorReasons.join(' | ')}`],
          remediation: `Run the RCA sub-agent (subagent_type="rca-agent") for this SD, then retry the ${handoffType} handoff.`,
          details: { ...details, reason: 'RCA_REQUIRED_AFTER_2_RETRIES', prior_rejection_reasons: priorReasons },
        });
      } catch (e) {
        return { passed: true, score: 100, issues: [`unexpected-error: ${e?.message || e}`], details: { skipped: 'unexpected-error' } };
      }
    },
  };
}

export { GATE_NAME };
