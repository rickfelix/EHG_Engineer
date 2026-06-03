/**
 * PLAN->EXEC evidence gate for venture-build leaves
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 5 (FR-012)
 *
 * The decision that makes a hollow stub UN-buildable: a venture leaf may only
 * advance PLAN->EXEC when it has fresh evidence from its required agents (DATABASE
 * schema + VENTURE_STACK compliance + whatever else its manifest required), a
 * PASSING verification verdict (U3), and a VALID dependency DAG (U4). Missing any
 * => blocked, reusing the SUBAGENT_EVIDENCE_MISSING reason the handoff gate
 * already understands.
 *
 * Pure decision logic — the live wiring queries sub_agent_execution_results and
 * feeds the result here; headlessly unit-testable.
 *
 * @module lib/eva/bridge/leaf-gate
 */

/**
 * @param {object} params
 * @param {string[]} [params.required] - agent codes this leaf's manifest required
 * @param {string[]} [params.present]  - agent codes with fresh evidence rows
 * @param {{survives:boolean}|null} [params.verification] - U3 verdict
 * @param {{valid:boolean}|null} [params.dag] - U4 schedulability
 * @returns {{ready:boolean, missingAgents:string[], reasons:string[], reason:string}}
 */
export function evaluateLeafReadiness({ required = [], present = [], verification = null, dag = null } = {}) {
  const have = new Set(Array.isArray(present) ? present : []);
  const missingAgents = (Array.isArray(required) ? required : []).filter((a) => !have.has(a));

  const reasons = [];
  if (missingAgents.length) reasons.push(`missing agent evidence: ${missingAgents.join(', ')}`);
  if (!verification || !verification.survives) reasons.push('verification verdict not passed');
  if (!dag || !dag.valid) reasons.push('dependency DAG not valid');

  const ready = reasons.length === 0;
  return {
    ready,
    missingAgents,
    reasons,
    reason: ready ? 'ready' : 'SUBAGENT_EVIDENCE_MISSING',
  };
}
