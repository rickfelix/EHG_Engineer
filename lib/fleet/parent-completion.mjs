/**
 * parent_completion orchestration core -- SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-LANES-001 (FR-1/FR-2).
 *
 * Pure(ish) orchestration logic, decoupled from the CLI wrapper (scripts/run-parent-completion.mjs)
 * so it is unit-testable with injected dependencies -- mirrors claimOrchestratorForRollup's own
 * "core logic decoupled from CLI" shape.
 *
 * MUST be executed by a fleet-worker seat, never the coordinator: GATE_CLAIM_VALIDITY's
 * non_fleet_build_forbidden check correctly refuses a non-fleet-build session (measured live,
 * 2026-08-15T21:53Z) -- this module does not attempt to work around that, by design.
 *
 * Steps:
 *   (a) claim the orchestrator parent via claimOrchestratorForRollup (existing, unmodified helper)
 *   (b) retrigger PLAN-TO-LEAD ONLY when the latest handoff is status='blocked' AND
 *       metadata.wait===true AND all children are terminal (checkParentCompletable already
 *       confirmed this before this function is called) -- NEVER on 'rejected' or a real failure.
 *       Skipped entirely if the latest PLAN-TO-LEAD is already 'accepted'.
 *   (c) VERIFY the parent retrospective against RETROSPECTIVE_EXISTS's own selection-then-scoring
 *       pair (getFilteredRetrospective, then validateSDCompletionReadiness on whatever it selects
 *       -- TESTING finding TST-C1/TST-C2). If it would fail, this function CANNOT regenerate it
 *       itself (retrospective content synthesis needs an LLM -- the sanctioned retro-agent
 *       Task-tool invocation, which only a calling AGENT can make) -- it releases the claim and
 *       reports status='staged_retro_quality' with needsRegeneration=true so the calling agent can
 *       invoke retro-agent and re-run.
 *   (d) release the claim, ALWAYS (finally) -- including on any failure at (b) or (c).
 *
 * IDEMPOTENCY: re-running after step (b) already succeeded (latest handoff now 'accepted') skips
 * straight to (c) on the next call -- no duplicate PLAN-TO-LEAD row.
 *
 * STEP-(d)-FAILURE REPORTING: if the release itself fails, this is reported as a distinct
 * STRANDED_CLAIM condition, never silently swallowed and never conflated with FR-5's planning-
 * outcome vocabulary (it is an operational hazard, not a planning outcome).
 */

import { claimOrchestratorForRollup } from '../../scripts/claim-orchestrator-for-rollup.mjs';
import { checkParentCompletable } from './orchestrator-completion.cjs';

export const STATUS = {
  COMPLETED: 'completed',
  STAGED_RETRO_QUALITY: 'staged_retro_quality',
  STAGED_OTHER_GATE: 'staged_other_gate',
  NOT_READY: 'not_ready',
};

/**
 * Default handoff runner: shells out to the real, sanctioned, unmodified handoff.js CLI.
 * Injectable so tests never spawn a real subprocess (TESTING finding: "the one missing seam").
 * @returns {Promise<{pass: boolean, score: number|null, reason: string|null, raw: string}>}
 */
export async function defaultRunHandoff(phase, sdKey) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  let stdout = '';
  let code = 0;
  try {
    const r = await execFileAsync('node', ['scripts/handoff.js', 'execute', phase, sdKey], { maxBuffer: 10 * 1024 * 1024 });
    stdout = r.stdout || '';
  } catch (e) {
    // execFile rejects on non-zero exit -- handoff.js exits 1 on FAIL, which is an expected outcome
    // here, not a thrown error condition. Still capture stdout for parsing.
    stdout = (e.stdout || '') + (e.stderr || '');
    code = typeof e.code === 'number' ? e.code : 1;
  }
  const resultLine = stdout.match(/HANDOFF_RESULT=(PASS|FAIL)\s+SD=\S+\s+SCORE=(\d+)\s+PHASE=\S+(?:\s+REASON=(\S+))?/);
  if (resultLine) {
    return { pass: resultLine[1] === 'PASS', score: Number(resultLine[2]), reason: resultLine[3] || null, raw: stdout };
  }
  // No parseable result line -- treat as a failure, never assume pass on ambiguous output.
  return { pass: false, score: null, reason: code === 0 ? 'UNPARSEABLE_HANDOFF_OUTPUT' : 'HANDOFF_PROCESS_ERROR', raw: stdout };
}

async function getLatestPlanToLead(supabase, parent) {
  const keys = [parent.id, parent.sd_key].filter(Boolean);
  const orClause = keys.map((k) => `sd_id.eq.${k}`).join(',');
  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('id, status, metadata, created_at, accepted_at, created_by')
    .or(orClause)
    .eq('handoff_type', 'PLAN-TO-LEAD')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`PLAN-TO-LEAD handoff lookup failed: ${error.message}`);
  return (data && data[0]) || null;
}

/**
 * @param {object} deps
 * @param {object} deps.supabase
 * @param {string} deps.sessionId
 * @param {string} deps.parentKey - orchestrator parent sd_key or uuid
 * @param {(phase: string, sdKey: string) => Promise<{pass: boolean, score: number|null, reason: string|null}>} [deps.runHandoff]
 * @param {(sdUuid: string, sdCreatedAt: string|null, supabase: object, sdKey: string|null) => Promise<{retrospective: object|null, error: object|null}>} deps.getFilteredRetrospective
 * @param {(sd: object, retrospective: object|null) => Promise<{passed: boolean, score: number}>} deps.validateSDCompletionReadiness
 * @returns {Promise<{status: string, message: string, needsRegeneration?: boolean, handoffId?: string, blockedGate?: string, strandedClaim?: boolean}>}
 */
export async function runParentCompletion(deps) {
  const {
    supabase, sessionId, parentKey,
    runHandoff = defaultRunHandoff,
    getFilteredRetrospective,
    validateSDCompletionReadiness,
  } = deps;

  const { data: parent, error: parentErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, status, created_at, metadata')
    .eq(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentKey) ? 'id' : 'sd_key', parentKey)
    .maybeSingle();
  if (parentErr || !parent) {
    return { status: STATUS.NOT_READY, message: `Could not load parent ${parentKey}: ${parentErr?.message || 'not found'}` };
  }

  const completable = await checkParentCompletable(supabase, parent);
  if (completable.couldNotCheck) {
    return { status: STATUS.NOT_READY, message: `Eligibility could not be verified (${completable.reason}) -- refusing rather than assuming ready.` };
  }
  if (!completable.completable) {
    return { status: STATUS.NOT_READY, message: `Not yet completable: ${completable.reason}` };
  }

  const claim = await claimOrchestratorForRollup(supabase, { sdKey: parent.sd_key, sessionId });
  if (!claim.ok) {
    return { status: STATUS.NOT_READY, message: `Could not claim ${parent.sd_key}: ${claim.reason}` };
  }

  let result;
  try {
    result = await runSteps();
    return result;
  } finally {
    const release = await claimOrchestratorForRollup(supabase, { sdKey: parent.sd_key, sessionId, release: true });
    if (!release.ok) {
      // Never silently swallowed -- an operational hazard distinct from any planning outcome above.
      // Augments whatever result was already computed (or produces one, if runSteps itself threw)
      // rather than replacing it, so a STRANDED_CLAIM is always visible in the RETURNED result, not
      // only in a log line a caller may not be reading.
      console.error(`STRANDED_CLAIM: failed to release ${parent.sd_key}: ${release.reason}`);
      if (result) {
        result.strandedClaim = true;
        result.strandedClaimReason = release.reason;
      }
    }
  }

  async function runSteps() {
    // Step (b): narrow, explicit PLAN-TO-LEAD retrigger eligibility.
    let latestP2L;
    try {
      latestP2L = await getLatestPlanToLead(supabase, parent);
    } catch (e) {
      return { status: STATUS.NOT_READY, message: e.message };
    }

    if (latestP2L && latestP2L.status === 'accepted') {
      // Already accepted (e.g. -H's shape) -- skip step (b) entirely, proceed to (c).
    } else if (!latestP2L) {
      // No PLAN-TO-LEAD yet at all -- a first attempt, fine to trigger.
      const p2l = await runHandoff('PLAN-TO-LEAD', parent.sd_key);
      if (!p2l.pass) {
        return { status: STATUS.STAGED_OTHER_GATE, message: `PLAN-TO-LEAD did not pass on first attempt: ${p2l.reason || 'unknown reason'}`, blockedGate: p2l.reason || 'PLAN-TO-LEAD' };
      }
    } else if (latestP2L.status === 'blocked' && latestP2L.metadata?.wait === true) {
      // The WAIT discriminator -- the only condition under which a non-accepted handoff is retried.
      const p2l = await runHandoff('PLAN-TO-LEAD', parent.sd_key);
      if (!p2l.pass) {
        return { status: STATUS.STAGED_OTHER_GATE, message: `PLAN-TO-LEAD retrigger did not pass: ${p2l.reason || 'unknown reason'}`, blockedGate: p2l.reason || 'PLAN-TO-LEAD' };
      }
    } else {
      // 'rejected', or a real 'blocked' without metadata.wait=true -- NEVER retriggered (TS-2b).
      return {
        status: STATUS.STAGED_OTHER_GATE,
        message: `PLAN-TO-LEAD is '${latestP2L.status}' without the WAIT discriminator -- not retriggered; requires manual remediation.`,
        blockedGate: 'PLAN-TO-LEAD',
      };
    }

    // Step (c): verify-then-execute. Uses the gate's OWN selection-then-scoring pair, not a
    // re-derived heuristic (TST-C1/TST-C2).
    const { retrospective } = await getFilteredRetrospective(parent.id, parent.created_at || null, supabase, parent.sd_key || null);
    const readiness = await validateSDCompletionReadiness(parent, retrospective);
    if (!readiness.passed) {
      return {
        status: STATUS.STAGED_RETRO_QUALITY,
        needsRegeneration: true,
        message: `Retrospective would not pass RETROSPECTIVE_EXISTS (score ${readiness.score ?? 'n/a'}, need >=60) -- regenerate via the sanctioned retro-agent path (Task tool, subagent_type=retro-agent) with real content from the children's PRD/handoffs, then re-run parent_completion for ${parent.sd_key}.`,
      };
    }

    const lfa = await runHandoff('LEAD-FINAL-APPROVAL', parent.sd_key);
    if (lfa.pass) {
      return { status: STATUS.COMPLETED, message: `${parent.sd_key}: completed (LEAD-FINAL-APPROVAL accepted, score ${lfa.score}).` };
    }
    // A retrospective-specific failure post-regeneration is still possible (readiness passed our
    // own check but the live gate re-evaluates independently) -- report it under the SAME
    // retro-quality status rather than the generic staged_other_gate, per FR-5's vocabulary.
    if (lfa.reason === 'RETROSPECTIVE_EXISTS_FAILED' || lfa.reason === 'RETROSPECTIVE_EXISTS') {
      return { status: STATUS.STAGED_RETRO_QUALITY, needsRegeneration: true, message: `LEAD-FINAL-APPROVAL still failed RETROSPECTIVE_EXISTS after regeneration (score ${lfa.score ?? 'n/a'}).` };
    }
    return { status: STATUS.STAGED_OTHER_GATE, message: `${parent.sd_key}: staged_other_gate (${lfa.reason || 'unknown gate'}).`, blockedGate: lfa.reason || 'unknown' };
  }
}
