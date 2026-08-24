/**
 * Defect Disposition Loop
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-4
 *
 * Thin orchestration over EXISTING primitives — no new sub-agent, table, or service:
 *   detect       -> caller already has a defectContext (rcrId/fingerprint) from an existing
 *                   RCA trigger (lib/rca) — detection happened upstream, not in this module.
 *   classify     -> triggerEvent.classification (lib/rca/trigger-sdk.js CLASSIFICATIONS),
 *                   already assigned upstream; carried through in defectContext.
 *   diagnose     -> the RCA sub-agent (lib/sub-agents/rca.js execute()), invoked directly on
 *                   the known rcrId — this is what lets a RETRY re-diagnose: rca-orchestrator's
 *                   processTriggerEvent()/triggerQuick() gate invocation on `!existingRCR`
 *                   (fingerprint dedup), which would silently no-op on a same-fingerprint
 *                   retry. Calling the sub-agent's execute() directly on the already-known
 *                   rcrId bypasses that dedup for loop-internal retries specifically, without
 *                   touching rca-orchestrator.js's dedup (which still correctly prevents
 *                   duplicate RCR *creation* for the unrelated auto-trigger path).
 *   retry(<=2)   -> the guard sits BEFORE the diagnose call for attempt 2, so a 3rd attempt
 *                   is structurally unreachable, not merely discouraged by a post-hoc check.
 *   revise       -> caller-supplied remediation step (injected dependency; this module does
 *                   not know how to "fix" a defect — that is domain-specific).
 *   re-evaluate  -> re-run checkGateStatus after revise.
 *   verify       -> reads gate_status (WARN/FAIL/PASS) from the repaired RCA gate — NEVER the
 *                   boolean `passed`, since FR-2 ships warn-only (passed:true, gate_status:
 *                   'WARN' on a blocking condition would otherwise read as verified).
 *   record       -> preventive learning, via the existing issue_patterns/root_cause_reports
 *                   update path (injected dependency; production wiring updates the RCR row).
 *   escalate     -> called only when retries are exhausted and still not verified.
 *
 * O3=NOT_EXERCISED: if no natural (non-manufactured) defect occurs, this module is simply
 * never invoked in production — that is the expected, honestly-labeled outcome, not a gap.
 * Never call runDispositionLoop with a manufactured defect to force exercise.
 */

export const MAX_RETRIES = 2;

export const STAGES = Object.freeze([
  'detect', 'classify', 'diagnose', 'retry', 'revise',
  're-evaluate', 'verify', 'record', 'escalate'
]);

/**
 * Pure decision: does a gate result count as verified/resolved?
 * Reads gate_status ONLY — never the boolean `passed` (see module doc above).
 */
export function isVerified(gateResult) {
  return gateResult?.gate_status === 'PASS';
}

/**
 * Run the disposition loop for one already-detected, already-classified defect.
 *
 * @param {Object} defectContext - { rcrId, fingerprint, triggerEvent }
 * @param {Object} deps - injected primitives, all real implementations in production:
 * @param {Function} deps.checkGateStatus - async (defectContext) => gateResult ({gate_status,...})
 * @param {Function} deps.invokeDiagnosis - async (defectContext, {attempt}) => diagnosisResult
 * @param {Function} deps.revise - async (defectContext, diagnosisResult) => void
 * @param {Function} deps.recordLearning - async (defectContext, outcome) => void
 * @param {Function} deps.escalate - async (defectContext, outcome) => void
 * @param {number} [maxRetries] - defaults to MAX_RETRIES (2)
 * @returns {Promise<{outcome: 'RESOLVED'|'ESCALATED', attempts: number, trace: string[]}>}
 */
export async function runDispositionLoop(defectContext, deps, maxRetries = MAX_RETRIES) {
  const trace = ['detect', 'classify'];
  let lastGateResult = null;

  // attempt 0 = the initial diagnosis pass; attempts 1..maxRetries are retries.
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    trace.push('diagnose');
    if (attempt > 0) trace.push('retry');
    const diagnosis = await deps.invokeDiagnosis(defectContext, { attempt });

    trace.push('revise');
    await deps.revise(defectContext, diagnosis);

    trace.push('re-evaluate');
    lastGateResult = await deps.checkGateStatus(defectContext);

    trace.push('verify');
    if (isVerified(lastGateResult)) {
      trace.push('record');
      const outcome = { outcome: 'RESOLVED', attempts: attempt + 1, gateResult: lastGateResult };
      await deps.recordLearning(defectContext, outcome);
      return { outcome: 'RESOLVED', attempts: attempt + 1, trace };
    }
    // Guard sits here, BEFORE the loop would re-enter for a would-be attempt=maxRetries+1 —
    // the `for` condition itself makes a 3rd retry structurally unreachable.
  }

  trace.push('record', 'escalate');
  const outcome = { outcome: 'ESCALATED', attempts: maxRetries + 1, gateResult: lastGateResult };
  await deps.recordLearning(defectContext, outcome);
  await deps.escalate(defectContext, outcome);
  return { outcome: 'ESCALATED', attempts: maxRetries + 1, trace };
}

/**
 * Explicit, first-class record of whether the disposition loop was exercised by a natural
 * defect during a given window (e.g. an SD's build/verify phase). O3=NOT_EXERCISED is the
 * expected, honest outcome when no natural defect occurs — never manufacture one, and never
 * leave this silently unrecorded.
 *
 * @param {Object} params
 * @param {number} [params.naturalDefectCount=0]
 * @param {boolean} [params.manufactured=false] - if true, forces NOT_EXERCISED regardless of
 *   count: a manufactured defect can never satisfy exercise, by construction.
 */
export function recordDispositionLoopExerciseStatus({ naturalDefectCount = 0, manufactured = false } = {}) {
  const exercised = !manufactured && naturalDefectCount > 0;
  return {
    status: exercised ? 'EXERCISED' : 'NOT_EXERCISED',
    label: exercised ? 'O3=EXERCISED' : 'O3=NOT_EXERCISED',
    naturalDefectCount,
    note: manufactured
      ? 'A manufactured defect was excluded from exercise — only a natural defect counts.'
      : undefined,
    recorded_at: new Date().toISOString()
  };
}

/**
 * Wire the loop's dependencies to real, existing primitives (RCA gate, RCA sub-agent,
 * root_cause_reports). NOT invoked automatically by this SD — production auto-invocation
 * wiring (deciding WHEN a defect enters the loop) is a separate integration decision left
 * for the caller / a follow-on SD.
 *
 * HONEST LIMITATION (EXEC-phase prospective TESTING evidence, C4): `revise` here is a no-op
 * and `checkGateStatus` re-checks the SAME sdId-scoped gate on every iteration regardless of
 * defectContext, since no generic "fix" primitive exists in this codebase — revision is
 * inherently domain-specific. As shipped, this default wiring is a GUARANTEED-ESCALATE
 * configuration: it will never observe a gate transition from WARN/FAIL to PASS on its own,
 * because nothing it calls actually changes the underlying condition between iterations.
 * This factory demonstrates dependency SHAPE and real-primitive wiring for `checkGateStatus`,
 * `invokeDiagnosis`, and `recordLearning` — it does NOT prove the loop can resolve a defect,
 * and must not be used as-is in production without a caller-supplied `revise` that performs
 * a real remediation step.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - the SD whose RCA gate status is being checked
 */
export function createDefaultDispositionDeps(supabase, sdId) {
  return {
    checkGateStatus: async () => {
      const { createRCAGate } = await import('../../scripts/modules/handoff/executors/exec-to-plan/gates/rca-gate.js');
      const gate = createRCAGate(supabase);
      return gate.validator({ sdId });
    },
    invokeDiagnosis: async (defectContext) => {
      const { execute: executeRCASubAgent } = await import('../sub-agents/rca.js');
      return executeRCASubAgent(defectContext.rcrId, { code: 'RCA', name: 'Root Cause Analysis' }, { skipLearning: false });
    },
    revise: async () => {
      // No generic "fix" primitive exists — revision is domain-specific and MUST be
      // overridden by the caller wiring this loop to a concrete defect class. Left as a
      // no-op here means this default wiring cannot resolve anything (see HONEST
      // LIMITATION above) — it demonstrates shape, not a working remediation path.
    },
    recordLearning: async (defectContext, outcome) => {
      // Merge into existing metadata rather than overwrite — a full-object .update()
      // would silently clobber any other metadata already on the RCR row.
      const { data: existing } = await supabase
        .from('root_cause_reports')
        .select('metadata')
        .eq('id', defectContext.rcrId)
        .maybeSingle();
      await supabase
        .from('root_cause_reports')
        .update({
          metadata: {
            ...(existing?.metadata || {}),
            disposition_loop_outcome: outcome.outcome,
            disposition_loop_attempts: outcome.attempts,
            disposition_loop_recorded_at: new Date().toISOString()
          }
        })
        .eq('id', defectContext.rcrId);
    },
    escalate: async (defectContext, outcome) => {
      console.error(`[DispositionLoop] ESCALATED rcr=${defectContext.rcrId} attempts=${outcome.attempts}`);
    }
  };
}
