import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = '258ee3b1-bcef-4500-9090-7401762dac3b';
const SD_KEY = 'SD-FDBK-ENH-CADENCE-VOCAB-DISCRIMINATOR-001';
const SUB = 'TESTING';
const PHASE = 'PLAN';
const NONCE = new Date().toISOString();

const uniqueKey = `${SD_ID}|${SUB}|${PHASE}|prospective|${NONCE}`;
const invocation_id = createHash('sha256').update(uniqueKey).digest('hex');

const critical_issues = [];

const warnings = [
  {
    code: 'W-1',
    summary: 'Missing edge: metadata.unlock_gate present but .type missing/non-string',
    detail: 'FR-1 specifies allowlist match on .type, but TS suite has no case for unlock_gate={} or {type:123}. EXEC should add a unit subcase asserting fall-through to legacy logic (treat malformed unlock_gate as if absent). Without this, a malformed writer could silently bypass refusal.'
  },
  {
    code: 'W-2',
    summary: 'Missing edge: allowlist match (pr_cadence/time_window) but no next_workable_after',
    detail: 'TS-4 covers pr_cadence WITH future next_workable_after. Need a case where unlock_gate.type=pr_cadence but no timestamp AND no pr_cadence_minimum_days/session_log fall-through. Expected: source=none/active=false. Confirms refusal-eligible types do not inadvertently short-circuit to advisory when no real refusal data exists.'
  },
  {
    code: 'W-3',
    summary: 'days_remaining=null contract change (TS-1) may break downstream consumers',
    detail: 'TS-1 mandates days_remaining=null for advisory; TS-3 verifies positive integer for next_workable_after. JSDoc typedef must be updated to document that null is now valid for active=false advisory states (currently spec says null only when not active). Any downstream that does state.days_remaining > 0 rather than checking state.active could regress.'
  },
  {
    code: 'W-4',
    summary: 'formatRefusalMessage advisory rendering (FR-6) tension with FR-5 no-emit',
    detail: 'FR-5 says no refusal flow for advisory source; FR-6 asks formatRefusalMessage to handle source=unlock_gate_advisory. If FR-5 is correct, formatRefusalMessage will never see advisory state in production. Recommend EXEC keep FR-6 test (defense-in-depth) but document divergence in JSDoc.'
  },
  {
    code: 'W-5',
    summary: 'R-2 consumer-test breakage risk: existing child-sd-selector test does not stub computeGateState',
    detail: 'tests/unit/handoff/child-sd-selector.test.js mocks urgency-scorer + dependency-dag but NOT pre-claim-gate. New advisory branch executes against real computeGateState. New tests must either (a) mock computeGateState, or (b) construct child fixtures with full metadata flowing through real computeGateState. Option (b) preferred (mirrors orchestrator-routing-phase static-pin pattern from PR #3684).'
  },
  {
    code: 'W-6',
    summary: 'Static-pin scope anchor verification',
    detail: 'Proposed slice between "export function computeGateState" and "function buildGateState" is correct for current file shape (lines 46-101). However, CADENCE_REFUSAL_TYPES (FR-2) is module-level. If EXEC places the Set BELOW computeGateState, scoped slice would miss it. Recommend TWO anchors: (1) whole-file regex for the Set declaration, (2) scoped slice for the .has() usage inside computeGateState.'
  },
  {
    code: 'W-7',
    summary: 'TS-9 smoke test is environmental, not automated',
    detail: 'TS-9 asserts sd:next output for specific SD keys (-B/-C). This is a manual post-merge smoke; explicitly call out it is NOT a vitest case and runs once after PR merge. Document in test file header so PLAN-TO-LEAD does not look for an automated case.'
  },
  {
    code: 'W-8',
    summary: 'Missing edge: source-precedence (advisory wins over elapsed next_workable_after)',
    detail: 'Add unit case: governance_metadata.next_workable_after in PAST + metadata.unlock_gate.type=usage_signal should STILL return source=unlock_gate_advisory (not source=none with elapsed window). Confirms precedence is checked before timestamp evaluation.'
  },
  {
    code: 'W-9',
    summary: 'FR-5 acceptance criteria 2-3 (CADENCE_GATE_REFUSED audit-log behavior) lacks a TS row',
    detail: 'FR-5 has 3 acceptance criteria; only the static-pin regex (AC-1) is covered by TS-7. AC-2 (no audit-log row for advisory) and AC-3 (audit-log preserved for true refusals) need explicit integration tests against scripts/sd-start.js or a dependency injection seam.'
  }
];

const recommendations = [
  {
    code: 'R-1',
    summary: 'Add 4-5 supplementary unit cases for W-1/W-2/W-3/W-8 edge cases',
    detail: 'Expand TS suite from 9 to ~13 cases: malformed unlock_gate (W-1), allowlist-type-no-timestamp (W-2), elapsed-window-advisory precedence (W-8), days_remaining-null-not-positive (W-3), formatRefusalMessage source line (FR-6 AC-1). Brings distinct test-type count to 5 (well above PRD requirement of 2).'
  },
  {
    code: 'R-2',
    summary: 'Static-pin pattern: whole-file regex for Set declaration + scoped slice for usage',
    detail: 'fs.readFileSync once. (a) Run regex for CADENCE_REFUSAL_TYPES declaration on full source. (b) Slice from "export function computeGateState" to "function buildGateState" and regex for the .has() call within that slice. Combines orchestrator-routing-phase scoping (memory PR #3684) with sd-type-enum.js freeze-pattern verification.'
  },
  {
    code: 'R-3',
    summary: 'child-sd-selector test: use real computeGateState with full fixture metadata (option b)',
    detail: 'Construct child fixtures: (i) metadata.unlock_gate.type=usage_signal + future next_workable_after → expect retained; (ii) governance_metadata.next_workable_after only → expect filtered. Both flow through REAL computeGateState. Mirrors PR #3684 static-pin pattern. Avoid vi.mock("lib/cadence/pre-claim-gate.mjs") — that bypasses the unit under test.'
  },
  {
    code: 'R-4',
    summary: 'Update JSDoc GateState typedef',
    detail: 'Change days_remaining doc from "null when not active" to "null when not active OR when source=unlock_gate_advisory". Source union adds "unlock_gate_advisory". This is a contract change consumers may import via JSDoc reference.'
  },
  {
    code: 'R-5',
    summary: 'Vitest config check for .test.mjs extension support',
    detail: 'Verify vitest.config.* glob includes .mjs (default vitest includes mjs/js/ts/cjs/etc). If repo uses a restrictive include array, EXEC must update config or use .test.js extension. Quick check: search for vitest.config files and review test glob.'
  },
  {
    code: 'R-6',
    summary: 'TS-5 console-substring assertion: use console.log spy + em-dash UTF-8 verification',
    detail: 'vi.spyOn(console, "log") + assert spy.mock.calls.some(c => String(c[0] || "").includes(LITERAL)). The em-dash character (U+2014) must be encoded UTF-8 in test file (verify no BOM, no ASCII fallback).'
  },
  {
    code: 'R-7',
    summary: 'Add integration test for FR-5 audit-log AC-2/AC-3',
    detail: 'Integration test against scripts/sd-start.js cadence-refusal block (or a refactored seam) asserting CADENCE_GATE_REFUSED row is NOT inserted for advisory and IS inserted for true refusals. May require a small SD-start refactor to expose the audit-log decision point as a unit-testable function.'
  }
];

const findings = {
  scenarios_assessed: 9,
  scenarios_recommended: 13,
  test_type_distribution_proposed: { unit: 5, integration: 1, regression: 1, static_guard: 1, smoke: 1 },
  distinct_test_types: 5,
  prd_requirement_distinct_types: 2,
  meets_distinct_type_requirement: true,
  static_pin_pattern_viable: true,
  static_pin_recommendation: 'Whole-file regex for Set declaration + scoped slice (between computeGateState export and buildGateState) for the .has() usage',
  consumer_test_breakage_risk_assessed: true,
  consumer_test_breakage_mitigation: 'Use real computeGateState with full fixture metadata (R-3), avoid mocking pre-claim-gate module',
  surface_area_coverage: {
    'computeGateState advisory path (FR-1)': 'TS-1, TS-2 — adequate',
    'computeGateState refusal-eligible allowlist (FR-1)': 'TS-4 — adequate',
    'computeGateState baseline regression (FR-1)': 'TS-3 — adequate',
    'CADENCE_REFUSAL_TYPES frozen Set (FR-2)': 'TS-7, TS-8 — adequate (with R-2 robustness)',
    'child-sd-selector cadenceCleared advisory (FR-3)': 'TS-5 — adequate (with R-3 mitigation)',
    'getCadenceBadge advisory empty string (FR-4)': 'TS-6 — adequate',
    'sd-start.js cadence-refusal short-circuit (FR-5)': 'PARTIAL — only AC-1 covered by TS-7; AC-2/AC-3 audit-log behavior uncovered (W-9, R-7)',
    'formatRefusalMessage source surface (FR-6)': 'NOT COVERED — recommend TS-10 unit case (W-4, R-1)'
  },
  edge_cases_missing: [
    'malformed unlock_gate (W-1)',
    'allowlist-type but no timestamp (W-2)',
    'elapsed next_workable_after + advisory unlock_gate (W-8)',
    'formatRefusalMessage source=advisory (W-4)',
    'scripts/sd-start.js audit-log advisory short-circuit (W-9)'
  ],
  validation_mode_rationale: 'prospective: PRD review pre-EXEC; no test execution performed; assessment is structural/coverage-based only.',
  verdict_rationale: 'PASS with warnings. 9 scenarios cover the core advisory/refusal discriminator path with adequate distinct test types (5, vs PRD requirement of 2). Static-pin pattern is viable with R-2 robustness refinement. Consumer-test breakage risk is real but mitigable via R-3. Edge-case gaps (W-1/W-2/W-8) and FR-5/FR-6 coverage holes (W-4/W-9) are MEDIUM severity — they will not block the core fix but should be addressed pre-EXEC-TO-PLAN.'
};

const row = {
  sd_id: SD_ID,
  sub_agent_code: SUB,
  sub_agent_name: 'testing-agent',
  phase: PHASE,
  validation_mode: 'prospective',
  verdict: 'PASS',
  confidence: 86,
  critical_issues,
  recommendations,
  warnings,
  detailed_analysis: findings,
  invocation_id,
  metadata: {
    sd_key: SD_KEY,
    prd_id: 'PRD-SD-FDBK-ENH-CADENCE-VOCAB-DISCRIMINATOR-001',
    test_scenarios_assessed: 9,
    test_scenarios_recommended_total: 13,
    distinct_test_types: 5,
    prospective: true,
    nonce: NONCE,
    invoked_by: 'orchestrator (PLAN prospective TESTING review)'
  }
};

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .insert(row)
  .select('id, verdict, confidence, validation_mode, phase')
  .maybeSingle();

if (error) {
  console.error('INSERT ERROR:', JSON.stringify(error, null, 2));
  process.exit(1);
}

console.log('INSERTED:', JSON.stringify(data, null, 2));
console.log('invocation_id:', invocation_id);
