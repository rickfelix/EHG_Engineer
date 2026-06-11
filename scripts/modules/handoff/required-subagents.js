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
