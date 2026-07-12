/**
 * Kill-to-exit wiring — SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-H FR-1/FR-5.
 *
 * Thin orchestration layer connecting an APPROVED thesis-kill chairman decision
 * to the existing exit-execution engine (supabase/functions/execute-exit) — WITHOUT
 * ever calling it. This module creates a PENDING exit-init marker only: it never
 * approves, advances, or calls execute-exit/kill_venture itself. A chairman still
 * manually drives the existing, unmodified execute-exit flow to actually run the
 * exit. See docs/design/spine-system-architecture-review.md §4/§5 and the SD's
 * corrected description for the ground-truth investigation behind this scope.
 *
 * SECURITY (RISK sub-agent, row a08f9f05, security domain 7/10): this module MUST
 * NEVER construct a payload containing chairman_approval, an 'advance' action, or
 * any call into execute-exit or kill_venture. That invariant is enforced by
 * construction (no such calls exist in this file) and pinned by a structural test
 * (tests/unit/exit-wiring.test.js) that greps this file for those forbidden tokens.
 *
 * Persistence: no new table (TR-1/TR-2) — the PENDING exit-init marker is a
 * system_events row, mirroring thesis-kill-gate.js's own logging pattern exactly.
 */

export const EXIT_INIT_EVENT_TYPE = 'exit_init_pending';
export const THESIS_KILL_DECISION_TYPE = 'thesis_kill_tier_b';

/**
 * Best-effort, never-throwing system_events write — mirrors thesis-kill-gate.js's
 * logThesisKillEvent shape exactly. A logging failure must never propagate to the
 * caller (an approval CLI command must still succeed even if this wiring fails).
 */
export async function createPendingExitInit({ supabase, ventureId, decisionId, rationale, logger = console }) {
  try {
    if (!supabase || !ventureId || !decisionId) {
      throw new Error('createPendingExitInit requires supabase, ventureId, and decisionId');
    }
    const stamp = new Date().toISOString();
    const { error } = await supabase.from('system_events').insert({
      event_type: EXIT_INIT_EVENT_TYPE,
      venture_id: ventureId,
      idempotency_key: `${EXIT_INIT_EVENT_TYPE}:${ventureId}:${decisionId}`,
      payload: { venture_id: ventureId, decision_id: decisionId, decision_type: THESIS_KILL_DECISION_TYPE, rationale: rationale ?? null },
      details: { venture_id: ventureId, decision_id: decisionId, decision_type: THESIS_KILL_DECISION_TYPE, rationale: rationale ?? null },
      created_at: stamp,
    });
    if (error) {
      logger.warn(`[exit-wiring] system_events write failed (non-fatal): ${error.message}`);
      return { created: false, reason: error.message };
    }
    logger.log(`[exit-wiring] PENDING exit-init created for venture ${ventureId} (decision ${decisionId})`);
    return { created: true };
  } catch (err) {
    logger.warn(`[exit-wiring] system_events write failed (non-fatal): ${err.message}`);
    return { created: false, reason: err.message };
  }
}

/**
 * Queryable status check for FR-5 (a chairman can see a kill-approved venture has
 * an exit ready to be manually driven). Read-only; never mutates.
 */
export async function getPendingExitInit({ supabase, ventureId }) {
  if (!supabase || !ventureId) {
    throw new Error('getPendingExitInit requires supabase and ventureId');
  }
  const { data, error } = await supabase
    .from('system_events')
    .select('id, venture_id, payload, created_at')
    .eq('event_type', EXIT_INIT_EVENT_TYPE)
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * Called from scripts/eva-decisions.js's approveDecision() after a successful
 * approval write. Only acts on thesis_kill_tier_b decisions; every other
 * decision_type is a no-op. Never throws — a wiring failure must not affect the
 * (already-committed) approval.
 */
export async function onDecisionApproved({ supabase, decision, logger = console }) {
  if (!decision || decision.decision_type !== THESIS_KILL_DECISION_TYPE) {
    return { acted: false };
  }
  const result = await createPendingExitInit({
    supabase,
    ventureId: decision.venture_id,
    decisionId: decision.id,
    rationale: decision.rationale,
    logger,
  });
  return { acted: true, ...result };
}
