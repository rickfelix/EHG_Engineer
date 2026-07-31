/**
 * Required sub-agents per handoff type — single source of truth.
 * SD-MAN-ORCH-LEO-HARNESS-EFFICIENCY-001-C (FR-3).
 *
 * Before this module, two copies of "which agents are required" lived in:
 *   - scripts/modules/handoff/gates/subagent-evidence-gate.js (REQUIRED_SUBAGENTS,
 *     the canonical BLOCKING set enforcing SUBAGENT_EVIDENCE_MISSING)
 *   - scripts/modules/phase-subagent-orchestrator/phase-config.js (sd_type-aware
 *     orchestration matrices — a DIFFERENT semantic layer, left in place)
 * The gate's blocking set is the contract every handoff must satisfy; the
 * orchestrator now unions this set into its launch plan (via options.handoffType)
 * so one parallel run is always sufficient for the gate.
 *
 * These agents are independent evidence WRITERS (each inserts its own
 * sub_agent_execution_results row — no shared upsert, no ordering requirement),
 * so they are safe to invoke CONCURRENTLY. See the concurrency mandate in
 * CLAUDE_EXEC.md / CLAUDE_PLAN.md (leo_protocol_sections 540/541).
 */

/**
 * Canonical blocking set per handoff type. Matches the SUBAGENT_EVIDENCE_MISSING
 * gate contract — changing a value here changes what handoffs block on.
 *
 * ─── 'Explore' RETAINED, and why (SD-FDBK-FIX-GATE-SUBAGENT-EVIDENCE-001) ───
 * When the gate began comparing verdicts, the open question was whether requiring
 * 'Explore' would make LEAD-TO-PLAN unpassable, since Explore is a Claude Code
 * BUILT-IN agent and is absent from `leo_sub_agents` (33 registered codes, zero
 * match) — so `execute-subagent.js --code EXPLORE` throws in the DB loader and
 * writes an error row. The proposed remedies were (a) register Explore in
 * leo_sub_agents or (b) drop it from this set.
 *
 * Neither was taken, because measurement refuted the premise (whole-table counts,
 * 2026-07-31). Over 90 days:
 *   - 'Explore' (mixed case, the designed path — worker invokes the Task-tool
 *     agent and persists the row): n=157 → PASS 136, CONDITIONAL_PASS 15,
 *     WARNING 6, FAIL 0.
 *   - 'EXPLORE' (upper, the mis-invoked CLI path): n=56 → PASS 24, FAIL 24,
 *     CONDITIONAL_PASS 5, WARNING 3. The FAILs all carry
 *     metadata.error = "Failed to load sub-agent EXPLORE from database".
 * Both normalise to EXPLORE in the gate. Collapsing to the LATEST row per
 * normalised code across the 209 SDs holding explore evidence gives: PASS 159,
 * CONDITIONAL_PASS 19, WARNING 9, FAIL 22 — i.e. 187/209 (89.5%) satisfy the
 * verdict policy. Requiring Explore is therefore a real, routinely-met
 * requirement, not the tombstone it was believed to be; dropping it would have
 * removed working coverage. Nothing automated forces the failing CLI path — the
 * orchestrator explicitly skips Explore with a warning
 * (phase-subagent-orchestrator/index.js, "runs via the Task tool").
 *
 * PRECONDITION FOR PROMOTING SUBAGENT_VERDICT_MODE=block: the residual ~10% above
 * is the known cost, and it is 100% attributable to the unregistered-EXPLORE CLI
 * path leaving a tombstone as the last row. Resolve that first — per the RCA in
 * scripts/one-off/_enhance-retro-fw3-framing-plumbing-001-b.mjs, either promote
 * the manual-persist workaround into a supported `scripts/record-explore-evidence.js`
 * CLI, or gate exploration via prd.exploration_summary at PLAN-TO-EXEC instead.
 * Tracked as harness_backlog 6529e3a3. Until then the gate's advisory default
 * keeps this cost at zero.
 */
export const REQUIRED_SUBAGENTS = {
  'LEAD-TO-PLAN': ['VALIDATION', 'Explore'],
  'PLAN-TO-EXEC': ['TESTING'],
  'EXEC-TO-PLAN': ['TESTING', 'SECURITY'],
  'PLAN-TO-LEAD': ['RETRO'],
  'LEAD-FINAL-APPROVAL': []
};

/**
 * Map a handoff type to the orchestrator phase whose run collects its evidence.
 * Used by `npm run subagents:collect` to translate gate vocabulary into the
 * phase-subagent-orchestrator's vocabulary (VALID_PHASES in phase-config.js).
 */
export const HANDOFF_TO_ORCHESTRATOR_PHASE = {
  'LEAD-TO-PLAN': 'LEAD_PRE_APPROVAL',
  'PLAN-TO-EXEC': 'PLAN_PRD',
  'EXEC-TO-PLAN': 'PLAN_VERIFY',
  'PLAN-TO-LEAD': 'LEAD_FINAL',
  'LEAD-FINAL-APPROVAL': 'LEAD_FINAL'
};

/**
 * Required (blocking) sub-agent codes for a handoff type.
 * @param {string} handoffType - e.g. 'EXEC-TO-PLAN'
 * @returns {string[]} agent codes (empty array for unknown/none)
 */
export function getRequiredSubAgents(handoffType) {
  return REQUIRED_SUBAGENTS[handoffType] || [];
}
