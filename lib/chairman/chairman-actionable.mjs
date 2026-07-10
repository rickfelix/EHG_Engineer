/**
 * Chairman-actionable predicate — JS mirror of the canonical SQL allowlist.
 * SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001 FR-5.
 *
 * CANONICAL SOURCE: database/migrations/20260710_create_get_pending_chairman_items.sql
 * (get_pending_chairman_items RPC, SD-EHG-CONSOLE-PENDING-ITEMS-RPC-001). Change the
 * predicate THERE first; this module mirrors it for JS callers that cannot call the RPC
 * per-row (the scheduled SLA sweep). Keep the two in lockstep.
 *
 * SUPERSET INTENT (documented, deliberate): the console queue admits only the allowlist
 * below, while the ESCALATION path additionally admits ANY blocking pending decision that
 * is not machine telemetry — the SD's contract is "escalation fires for EVERY blocking
 * pending decision regardless of raiser" (e.g. blocking stage_gate and session_question
 * rows escalate by email even though the console RPC does not list those types). The two
 * predicates therefore intentionally differ ONLY by the blocking-row clause; the telemetry
 * and fixture exclusions are shared, so the C7 noise class can flood neither surface.
 */

/** Types the console allowlist admits unconditionally (status='pending'). */
export const CONSOLE_ACTIONABLE_TYPES = Object.freeze(['chairman_approval', 'gate_decision']);

/** Types the console allowlist admits only when the row is blocking. */
export const CONSOLE_BLOCKING_ONLY_TYPES = Object.freeze(['escalation', 'okr_acceptance']);

/** Machine-telemetry decision types deliberately NOT chairman-actionable (never escalate/email). */
export const TELEMETRY_DECISION_TYPES = Object.freeze(['flag_review', 'flag_enablement']);

/** Fixture-venture name patterns (mirrors the SQL: is_demo, '__%', 'test venture%', '%citest%', 'canonical-source-test%'). */
const FIXTURE_NAME_PATTERNS = [
  /^__/i,
  /^test venture/i,
  /citest/i,
  /^canonical-source-test/i,
];

/**
 * Is this venture a fixture (demo/test) venture? NULL/unreadable venture resolves to
 * NOT-fixture (include), matching the SQL's fail-include behavior.
 * @param {{ name?: string, is_demo?: boolean }|null|undefined} venture
 * @returns {boolean}
 */
export function isFixtureVenture(venture) {
  if (!venture) return false;
  if (venture.is_demo === true) return true;
  const name = venture.name || '';
  return FIXTURE_NAME_PATTERNS.some((re) => re.test(name));
}

/**
 * Console-queue predicate — exact mirror of the get_pending_chairman_items row filter
 * (venture exclusion handled separately via isFixtureVenture, as the SQL does via join).
 * @param {{ status?: string, decision_type?: string, blocking?: boolean }} row
 * @returns {boolean}
 */
export function isConsoleActionable(row = {}) {
  if (row.status !== 'pending') return false;
  if (CONSOLE_ACTIONABLE_TYPES.includes(row.decision_type)) return true;
  return CONSOLE_BLOCKING_ONLY_TYPES.includes(row.decision_type) && row.blocking === true;
}

/**
 * Escalation predicate — console-actionable OR any blocking pending non-telemetry row
 * (the documented superset; see header). Telemetry types never escalate, blocking or not.
 * @param {{ status?: string, decision_type?: string, blocking?: boolean }} row
 * @returns {boolean}
 */
export function isEscalationActionable(row = {}) {
  if (row.status !== 'pending') return false;
  if (TELEMETRY_DECISION_TYPES.includes(row.decision_type)) return false;
  return isConsoleActionable(row) || row.blocking === true;
}
