/**
 * SD-LEO-INFRA-HANDOFF-PREFLIGHT-AUTO-001 — FR-2 (ships flag-gated OFF by default).
 *
 * GATING DECISION (recorded on the SD: strategic_directives_v2.metadata.fr2_gating_decision):
 * the chairman provisional cited for autonomous sub-agent invocation as a risk class
 * (.artifacts/adam-plans/w3-tminus-charters-20260823.md @ ae53fee806f, P4 FR(6), §5.5) is
 * itself only a relay — the underlying provisional document does not exist anywhere in this
 * repo. Given that unmeasurable scope plus the same-risk-class analogy (this and
 * lib/error-triggered-sub-agent-invoker.js both write sub_agent_execution_results rows that
 * satisfy the very gate that would otherwise block) plus reversibility asymmetry, this module
 * MUST default to disabled and FAIL CLOSED on any unset or malformed flag value. Enabling it
 * requires its own future, separately recorded chairman decision — this SD does not enable it.
 *
 * SCOPE RESTRICTION (TR-7): reads ONLY the pre-enumerated `missing` array (the
 * SUBAGENT_EVIDENCE_MISSING class). It never receives or inspects `failing`/`non_evidence`
 * data (the SUBAGENT_EVIDENCE_BAD_VERDICT / SUBAGENT_EVIDENCE_NOT_RUN classes) — auto-invoking
 * on those would be auto-retrying an agent until it happens to pass, exactly the risk class
 * the gating decision exists to prevent. This is enforced structurally, not just behaviorally:
 * the function signature only accepts a flat array of missing agent codes.
 *
 * TR-4: this file has NO import of its own (verified — TS-7 asserts zero import statements)
 * — `executeSubAgentFn` below is REQUIRED at the call site, with no default. The production
 * wiring is the caller's responsibility: HandoffOrchestrator.js imports executeSubAgent from
 * lib/sub-agent-executor.js DIRECTLY (the same canonical evidence-writing path
 * scripts/execute-subagent.js uses) and passes it in explicitly. This file deliberately does
 * NOT import lib/error-triggered-sub-agent-invoker.js, which is a structurally distinct,
 * chairman-provisional-gated mechanism (error-pattern-triggered, with its own circuit breaker).
 */

export const AUTO_INVOKE_FLAG = 'HANDOFF_PREFLIGHT_AUTO_INVOKE';

/**
 * Fail-closed flag parser. Only the literal string 'true' enables auto-invoke; every other
 * value (unset, empty, '1', 'yes', 'TRUE', garbage) is treated as disabled.
 * @param {object} [env=process.env]
 * @returns {boolean}
 */
export function isAutoInvokeEnabled(env = process.env) {
  // Object.hasOwn (not bracket lookup alone) so an inherited/polluted
  // Object.prototype.HANDOFF_PREFLIGHT_AUTO_INVOKE can't flip this on.
  if (!env || !Object.hasOwn(env, AUTO_INVOKE_FLAG)) return false;
  return env[AUTO_INVOKE_FLAG] === 'true';
}

/**
 * Auto-invoke the missing sub-agents (MISSING class only) and return per-agent results.
 * Bounded by construction: exactly one invocation attempt per entry in `missing`, no retry
 * loop, no open-ended re-invocation — this function never calls itself or loops on failure.
 *
 * @param {{missing: string[], sdId: string, handoffType: string, executeSubAgentFn: Function}} params
 *   `executeSubAgentFn` is REQUIRED (no default) — callers/tests inject it explicitly, so
 *   tests never need a live DB/agent to exercise the bounded-invocation and scope-restriction
 *   logic, and production wiring (HandoffOrchestrator.js) must pass the real executeSubAgent.
 * @returns {Promise<{attempted: string[], results: Array<{code:string, verdict:string|null, error:string|null}>}>}
 */
export async function autoInvokeMissingSubAgents({ missing, sdId, handoffType, executeSubAgentFn }) {
  const codes = Array.isArray(missing) ? missing.filter((c) => typeof c === 'string' && c.trim().length > 0) : [];
  const results = [];
  for (const code of codes) {
    try {
      const outcome = await executeSubAgentFn(code, sdId, { phase: handoffType });
      results.push({ code, verdict: outcome?.verdict ?? null, error: null });
    } catch (err) {
      results.push({ code, verdict: null, error: err?.message || String(err) });
    }
  }
  return { attempted: codes, results };
}
