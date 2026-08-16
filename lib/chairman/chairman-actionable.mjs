/**
 * Chairman-actionable predicate — JS mirror of the canonical SQL allowlist.
 * SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001 FR-5.
 *
 * CANONICAL SOURCE: the LATEST `CREATE OR REPLACE FUNCTION public.get_pending_chairman_items`
 * migration under database/migrations/ (originally 20260710_create_get_pending_chairman_items.sql,
 * SD-EHG-CONSOLE-PENDING-ITEMS-RPC-001; most recently extended by
 * 20260815_extend_fixture_patterns_zzz_uat_epoch_chairman_items.sql, SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001).
 * Deliberately NOT a single hardcoded filename here — a hardcoded pointer is exactly what let
 * tests/integration/get-pending-chairman-items.contract.test.js silently test a superseded
 * migration while staying green. Change the predicate in the RPC first; this module mirrors it
 * for JS callers that cannot call the RPC per-row (the scheduled SLA sweep). Keep in lockstep.
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

/**
 * Fixture-venture name patterns (mirrors the SQL: is_demo, '__%', 'test venture%',
 * '%citest%', 'canonical-source-test%', '%-realdb-%', '%-noop-%', 'parity-test-%',
 * 'test-stub%', 'test-harness-%', 'ts-fixture-%', '\_pipeline\_test\_%',
 * 'pipeline-test-%', 'gate-test-%', 'ZZZ\_%', 'UAT-%'/'UAT\_%', epoch-tail).
 * SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-002: extended with the HCGate-RealDB-* /
 * *-noop-<ts> realdb-suite families that leaked into the chairman digest, plus the
 * write-guard families from lib/eva/chairman-decision-watcher.js so every SURFACE
 * excludes them too (the watcher deliberately stays narrower at the WRITE seam —
 * see its doc comment; surfaces filter what its carve-outs let through).
 * SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001: extended with ZZZ_-prefixed, UAT[-_]-anchored,
 * and epoch-tail-suffixed names — copied verbatim (NOT imported) from
 * lib/governance/fixture-exclusion.mjs's proven-correct FIXTURE_VENTURE_NAME_RE /
 * EPOCH_TAIL_RE forms; that module stays untouched per its own DO-NOT-COLLAPSE
 * docblock. Anchored, not substring: a cancelled QF (QF-20260807-014) already documents
 * the general defect CLASS this guards against — unanchored substring patterns
 * (the existing '-realdb-'/'-noop-'/'citest' entries above) over-excluding real
 * ventures it measured (my-app-realdb-check, svc-noop-probe, citest-runner). The 3
 * new patterns below are anchored specifically to avoid adding a same-class defect;
 * situation-tracker/evaluate-q3-venture/graduate-program-app (illustrative "uat"
 * substring collisions, not QF-cited examples) are covered by a negative-case test
 * in fixture-pattern-parity.test.js. The QF's own cited cases remain unfixed here —
 * out of this SD's scope, see that QF and PRD FR-5 for why.
 * Exported for the JS↔SQL pattern-parity test — keep in lockstep with the
 * canonical SQL (latest get_pending_chairman_items migration).
 */
export const FIXTURE_NAME_PATTERNS = Object.freeze([
  /^__/i,
  /^test venture/i,
  /citest/i,
  /^canonical-source-test/i,
  /-realdb-/i,
  /-noop-/i,
  /^parity-test-/i,
  /^test-stub/i,
  /^test-harness-/i,
  /^ts-fixture-/i,
  /^_pipeline_test_/i,
  /^pipeline-test-/i,
  /^gate-test-/i,
  /^ZZZ_/i,
  /^UAT[-_]/i,
  /[-:]\d{10,}$/,
]);

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
