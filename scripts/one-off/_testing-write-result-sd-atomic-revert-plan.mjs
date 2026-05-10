#!/usr/bin/env node
/**
 * Write testing-agent PLAN-phase verdict for SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001
 * sub_agent_code='TESTING', verdict='PASS' + warnings[]
 * Per memory note (validation-agent CONDITIONAL_PASS blocked outside retrospective):
 *   use PASS + warnings[] instead of CONDITIONAL_PASS in prospective phases.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_ID = '5de33889-820f-4758-a96f-363f17908e97';
const PHASE = 'PLAN';
const SUB_AGENT_CODE = 'TESTING';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const findings = {
  scenarios_review: {
    total_in_prd: 8,
    fr_coverage_check: {
      'FR-1 (atomic-revert helper)': {
        scenarios: ['TS-1 (static-pin single-UPDATE)', 'TS-2 (idempotency)', 'TS-3 (fail-loud throw)'],
        coverage: 'GOOD',
        gap: 'TS-2 covers idempotency-write but NOT the dry-run mode (FR-1 AC-3). Dry-run path is an FR-1 acceptance_criterion that lacks a test_scenario row.'
      },
      'FR-2 (DB view v_sd_completion_integrity)': {
        scenarios: ['TS-4 (witness detected + control not flagged)', 'TS-5 (orchestrator/documentation exemption)'],
        coverage: 'GOOD',
        gap: 'No test_scenario for FR-2 AC-3 (count>=275 baseline). Recommended: add TS-4b asserting count(*) >= 275 (or accept that this is empirically tied to dev DB state and skip in CI by guarding behind ATOMIC_REVERT_BASELINE_CHECK=1).'
      },
      'FR-3 (STATUS_INCONSISTENT badge)': {
        scenarios: ['TS-6 (view-absent graceful fallback)', 'TS-8 (sd:next smoke)'],
        coverage: 'PARTIAL',
        gap: 'No explicit unit test for getStatusBadge returning STATUS_INCONSISTENT text when sd_id IS in the inconsistent set (FR-3 AC-2 covers this but only via the integrated smoke TS-8). Recommended: add TS-9 unit test mocking the inconsistent Set and asserting badge text.'
      },
      'FR-4 (audit script)': {
        scenarios: ['TS-7 (--json mode child-process)'],
        coverage: 'WEAK',
        gap: 'FR-4 has 5 acceptance criteria but only 1 test_scenario. Missing: (a) read-only mode write-absence assertion (AC-2), (b) --execute non-TTY [INTERACTIVE_CONFIRM_REQUIRED] exit code (AC-3), (c) --filter feature narrowing (AC-5). Recommended: add TS-10 (read-only write-absence), TS-11 (non-TTY exit code 2), TS-12 (--filter narrowing).'
      },
      'FR-5 (test suite itself)': {
        scenarios: ['implicit across TS-1..TS-8'],
        coverage: 'GOOD',
        gap: 'FR-5 AC-5 (red-green-red verification: static-pin test FAILS when source is mutated to two .update() calls) requires a meta-test or developer-time manual verification. Recommended: include a commented test.skip block with mutated source body that, when temporarily unskipped, demonstrates the regex catches it. Alternative: document the red-green-red verification in test file JSDoc and run it once during EXEC-2.'
      }
    }
  },
  missing_coverage: [
    {
      id: 'GAP-1',
      severity: 'medium',
      issue: 'FR-4 --execute mode test strategy is underspecified. The PRD says --execute applies revertSD() with TTY-confirmation. Live DB writes against ~275 rows during CI is unacceptable.',
      recommendation: 'Use Strategy: mock revertSD via vi.mock("../../lib/sd/revert.js", () => ({ revertSD: vi.fn().mockResolvedValue({updated:true, was_idempotent:false, payload:{}}) })). For integration, restrict --execute test to (a) non-TTY [INTERACTIVE_CONFIRM_REQUIRED] path only, (b) --filter to an sd_type that has zero ghost SDs (e.g., synthetic non-existent type) producing zero writes, (c) explicit synthetic-ghost-SD fixture with INSERT+DELETE wrap (see Test Prerequisites). DO NOT execute real revertSD against the dev DB in CI.'
    },
    {
      id: 'GAP-2',
      severity: 'low',
      issue: 'No test for FR-4 batching-of-10 + progress reporting between batches (TR-4).',
      recommendation: 'Synthetic fixture inserting 25 ghost SDs + run --execute with --force-yes, assert 3 progress-report lines on stdout (10+10+5).'
    },
    {
      id: 'GAP-3',
      severity: 'medium',
      issue: 'View edge case: SD with sd_type=NULL is not addressed in test_scenarios. The exemption check NOT IN (orchestrator, documentation, docs) returns NULL for NULL sd_type values per SQL three-valued logic — those SDs would be excluded from is_ghost_completed=true unexpectedly.',
      recommendation: 'Add TS-13: synthetic SD with sd_type=NULL and no LEAD-FINAL-APPROVAL accepted — verify whether the view returns is_ghost_completed=true or excludes it. EXEC should COALESCE(sd_type,\'\') NOT IN (...) in the view DDL to match PRD intent (treat NULL as non-exempt).'
    },
    {
      id: 'GAP-4',
      severity: 'low',
      issue: 'No regression test for the memoization guarantee in TR-3 (getInconsistentSDIds called once per sd:next invocation, not per-SD).',
      recommendation: 'Use a vi.fn() spy on the underlying view-query call; iterate over 5 SDs through getStatusBadge; assert spy.mock.calls.length === 1.'
    },
    {
      id: 'GAP-5',
      severity: 'medium',
      issue: 'preserve_metadata option in FR-1 signature is documented but has no test_scenario.',
      recommendation: 'Add TS-14: revertSD(id, reason, {preserve_metadata: {custom_field: \'X\'}}) — assert returned payload.metadata contains both reverted_at and custom_field; assert custom_field does NOT overwrite reverted_at if collision.'
    }
  ],
  framework_setup: {
    vitest_version: '^4.1.4 (confirmed from package.json)',
    test_runner: 'vitest run for both tests/unit/ and tests/integration/',
    mocking_strategy: {
      supabase_unit_tests: 'vi.mock(\'../../lib/supabase-client.js\') returning a chainable mock with from()/update()/select()/eq()/single() — pattern used in tests/unit/sd-leo-* across the repo. Mock returns {data, error} per call. Do NOT use pglite or in-memory PostgreSQL for unit tests; mocks are sufficient and faster.',
      supabase_integration_tests: 'Real dev DB via process.env.SUPABASE_URL + SERVICE_ROLE_KEY. View test queries v_sd_completion_integrity directly. Use existing witness sd_id b737c27f-3e83-4887-999e-3c1ae158faf4 (confirmed present, status=completed, sd_type=feature, ZERO accepted LEAD-FINAL-APPROVAL rows — has only rejected ones). Control row: 09473fbf-4b56-4858-bf4b-1e02e1e7eb35 (SD-MAN-INFRA-SHELL-RESILIENT-TERMINAL-001, sd_type=infrastructure, has 1 accepted LEAD-FINAL-APPROVAL) — should return is_ghost_completed=false.',
      audit_script_integration: 'Child process via execa or node:child_process.spawn. Capture stdout/stderr/exitCode. For --execute test, use --filter <synthetic_type_with_zero_matches> OR mock revertSD via vi.mock — DO NOT execute revertSD against real DB.'
    },
    integration_db_strategy: 'Use the SHARED dev DB (process.env.SUPABASE_URL). View migration applied via standard migration pipeline BEFORE running integration tests. Tests that INSERT synthetic ghost SDs MUST wrap in try/finally with explicit DELETE in finally to prevent test data leak. Tests must NOT depend on a specific witness count (>=275 may drift over time) — pin only to the named witness sd_id and at least one exemption-type fixture.'
  },
  static_pin_validation: {
    pattern_in_prd: 'Dual-anchor + scoped-slice (per memory note re: cadence-vocab discriminator SD)',
    robustness_assessment: 'ROBUST. Pattern matches the proven approach in tests/unit/cadence/pre-claim-gate-static-guard.test.js which has already shipped successfully in SD-FDBK-ENH-CADENCE-VOCAB-DISCRIMINATOR-001.',
    recommended_implementation: 'Use named anchor function (sliceBetweenAnchors) from cadence test — copy the helper or extract to tests/helpers/static-pin.js. For revertSD scoped slice:\\n  const startAnchor = \\\"export async function revertSD\\\";\\n  const endAnchor = \\\"\\\\nexport \\\";  // next module-level export\\n  // OR: walk brace depth from after first { until matching }\\nRecommend brace-depth walker over string-anchor for robustness when other exports might be reordered.',
    improvements: [
      'Add anti-test: a test that INTENTIONALLY mutates the source string in-memory (regex replace), runs the static-pin test against the mutated string, and asserts the test fails. This is FR-5 AC-5 red-green-red verification automated.',
      'Pin TWO regexes: (1) /\\.from\\([\\\\\\\'\\\"]strategic_directives_v2[\\\\\\\'\\\"]\\)/g must match exactly ONCE and (2) /\\.update\\(/g within the scoped slice must match exactly ONCE. Separating these catches the case where a future refactor adds .from() to a different table inside revertSD.',
      'Add a SCHEMA pin: assert the scoped slice contains the literal column names (status, current_phase, progress, metadata) — if a future refactor renames metadata to attributes, the static guard catches it before merge.'
    ]
  },
  test_prerequisites: {
    db_fixtures_needed: [
      'View migration applied to dev DB before integration tests run (CI step: psql -f database/migrations/<date>_v_sd_completion_integrity.sql)',
      'Witness SD b737c27f-3e83-4887-999e-3c1ae158faf4 exists in DB (verified present)',
      'Control SD 09473fbf-4b56-4858-bf4b-1e02e1e7eb35 exists with accepted LEAD-FINAL-APPROVAL (verified present)',
      'For exemption tests: either find an existing orchestrator-type SD with status=completed and no accepted LEAD-FINAL-APPROVAL (likely exists per RCA findings on 275 ghosts), OR INSERT a synthetic test row in beforeAll + DELETE in afterAll.'
    ],
    synthetic_test_data: {
      required: true,
      reason: 'GAP-3 (sd_type=NULL edge case) and GAP-2 (batching) require synthetic data. Witness + control alone cannot exercise all branches.',
      pattern: 'beforeAll: INSERT 3 synthetic SDs (orchestrator/null/feature) with status=completed and NO accepted SPH rows; afterAll: DELETE by sd_key prefix LIKE \\\"SD-TEST-ATOMIC-REVERT-%\\\". Use sd_type validation: \\\"orchestrator\\\" and NULL are valid; check schema constraints first.',
      cleanup: 'afterAll hook MUST DELETE synthetic rows even on test failure. Use try/finally OR vitest hook with no-throw guarantee.'
    }
  },
  test_loc_estimate: {
    prd_estimate: 350,
    revised_estimate: '380-450',
    breakdown: {
      'tests/unit/sd-revert.test.js (static-pin + idempotency + dry-run + fail-loud + preserve_metadata)': 110,
      'tests/integration/sd-completion-integrity-view.test.js (witness + control + exemptions + NULL + count baseline)': 130,
      'tests/unit/sd-next-ghost-badge.test.js (getInconsistentSDIds + badge composition + memoization + graceful fallback)': 90,
      'tests/integration/audit-ghost-completed-sds.test.js (--json + read-only + --filter + non-TTY exit codes + batching)': 90,
      'tests/helpers/static-pin.js (shared brace-depth slicer + red-green-red helper)': 30
    },
    rationale: 'PRD estimate of 350 LOC is tight given the 8 scenarios. With recommended additions (TS-9, TS-10, TS-11, TS-12, TS-13, TS-14) bringing total to 14 scenarios + 1 helper file, 380-450 LOC is realistic. Single file >150 LOC for the view integration test is unavoidable due to fixture setup/teardown.'
  },
  audit_script_execute_mode_strategy: {
    question_posed: 'Does FR-4 --execute mode test require a real DB transaction with rollback, or can it be mocked?',
    answer: 'MOCKED for CI, with one bounded synthetic-data integration test.',
    detailed_strategy: {
      ci_default: 'Mock revertSD via vi.mock at the module-import boundary. Test exercises the CLI parsing, batching, confirmation gating, and progress-reporting logic without touching production data. This is the bulk of FR-4 coverage.',
      bounded_integration: 'ONE integration test that (a) INSERTs 3 synthetic ghost SDs in beforeAll with sd_key prefix SD-TEST-ATOMIC-REVERT-FIXTURE-, (b) runs scripts/audit-ghost-completed-sds.mjs --execute --force-yes --filter <synthetic_distinguishing_sd_type>, (c) asserts all 3 fixture rows now have metadata.reverted_at set, (d) afterAll DELETEs the fixtures. This proves the end-to-end write path works without large-scale DB mutation.',
      anti_pattern: 'Do NOT use a Postgres SAVEPOINT/ROLLBACK around the script invocation — Supabase REST API does not honor client-side transaction boundaries, and the script uses its own supabase client instance. Explicit synthetic-data + cleanup is the only reliable pattern.',
      ci_safety: 'The integration test MUST use --filter with a value that ONLY matches the synthetic fixtures (e.g., set sd_type to a temporary value or insert with an unusual sd_key pattern and have the filter match by sd_key). If --filter cannot narrow tightly, set CI env flag ATOMIC_REVERT_EXECUTE_INTEGRATION=1 and gate the test behind it; default-disable to prevent accidental mass-revert in regression runs.'
    }
  },
  test_design_warnings: [
    'WARN-1: Witness sd_id b737c27f-... has BOTH rejected LEAD-FINAL-APPROVAL rows AND one rejected LEAD-TO-PLAN row in SPH. The view filter MUST use status=\\\"accepted\\\" (not just check existence) — verified present in PRD FR-2 DDL. Confirm EXEC implements with .eq(status, accepted) in the EXISTS subquery.',
    'WARN-2: The PRD says FR-2 AC-3 \\\"count(*) >= 275 (matches RCA empirical baseline)\\\" — this count will DRIFT as ghost SDs are reverted via the audit script. Recommend the AC be reworded to count(*) >= 1 (witness must always flag) OR gate the >=275 assertion behind a baseline-check env flag.',
    'WARN-3: status-helpers.js getInconsistentSDIds graceful-fallback test (TS-6) needs to assert console.warn is called EXACTLY ONCE at module load — implementing this with vitest requires careful module-cache reset between tests. Use vi.resetModules() in beforeEach for the warn-once test specifically.',
    'WARN-4: FR-1 idempotency test (TS-2) — second call returns was_idempotent=true. But the PRD also says \\\"returns the existing payload unchanged\\\". The test MUST assert payload.metadata.reverted_at on both calls is exactly equal (===), not just truthy. A naive impl might re-write the timestamp.',
    'WARN-5: The view is_ghost_completed boolean depends on three-valued logic for sd_type NOT IN (...) where sd_type IS NULL. Best practice: use COALESCE(sd_type, \\\"unknown\\\") NOT IN (\\\"orchestrator\\\", \\\"documentation\\\", \\\"docs\\\") OR add a separate sd_type IS NULL branch. EXEC should verify this and add TS-13 (sd_type=NULL case).',
    'WARN-6: Audit script --filter validation (TR-4 exit code 3 on validation error) — requires a canonical sd_type enum source. lib/sd/type-classifier.js (CANONICAL_SD_TYPES per SD-FDBK-INFRA-TYPE-SOURCE-TRUTH-001) is the authoritative source. EXEC must import from there, NOT hardcode the list.',
    'WARN-7: Vitest 4.x (^4.1.4) deprecated some 3.x mocking patterns. Verify any copy-paste from older sibling tests still works. Specifically, vi.mock() hoisting behavior is unchanged but vi.fn().mockResolvedValueOnce semantics for chained mocks may need explicit beforeEach resets.'
  ],
  recommendations_for_exec: [
    'Add TS-9, TS-10, TS-11, TS-12, TS-13, TS-14 to the test plan (specs in missing_coverage above) — brings total to 14 scenarios.',
    'Extract a shared tests/helpers/static-pin.js with brace-depth slicer + red-green-red helper for use across this SD and future SDs.',
    'In FR-2 view DDL, use COALESCE(sd_type, \\\"\\\") NOT IN (\\\"orchestrator\\\", \\\"documentation\\\", \\\"docs\\\") to handle NULL safely.',
    'In FR-4 audit script, import CANONICAL_SD_TYPES from lib/sd/type-classifier.js for --filter validation.',
    'Gate the >=275 count assertion behind ATOMIC_REVERT_BASELINE_CHECK=1 env flag (drift-tolerant).',
    'Wrap synthetic-data fixtures in beforeAll/afterAll with try/finally semantics — never leak test data into dev DB.',
    'For --execute mode CI test, default to mocked revertSD; gate real-write integration test behind ATOMIC_REVERT_EXECUTE_INTEGRATION=1.',
    'Add a meta-test (test.skip or comment-block) demonstrating red-green-red static-pin verification for FR-5 AC-5.'
  ]
};

const summary = `PLAN-phase test strategy review for SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001. ` +
  `Validated 8 PRD test_scenarios across 5 FRs. ` +
  `Coverage assessment: GOOD for FR-1, FR-2, FR-5; PARTIAL for FR-3; WEAK for FR-4 (5 ACs, 1 scenario). ` +
  `Identified 5 coverage gaps (GAP-1..GAP-5) — recommend adding 6 more test_scenarios (TS-9..TS-14) bringing total to 14. ` +
  `Vitest 4.1.4 confirmed; mocking strategy: vi.mock() for units, real dev DB for integration, mocked revertSD for FR-4 --execute CI default. ` +
  `Static-pin dual-anchor + scoped-slice pattern from cadence-vocab SD is ROBUST — recommend brace-depth walker over string-anchor for robustness; also recommend dual-regex pin + schema-column pin. ` +
  `Witness sd_id b737c27f-3e83-4887-999e-3c1ae158faf4 verified present (status=completed, sd_type=feature, ZERO accepted LEAD-FINAL-APPROVAL — only rejected) — will correctly flag is_ghost_completed=true if view filter uses status=\\\"accepted\\\". ` +
  `Control SD 09473fbf-... (SD-MAN-INFRA-SHELL-RESILIENT-TERMINAL-001, has accepted LEAD-FINAL-APPROVAL) verified present — should flag false. ` +
  `Synthetic fixtures REQUIRED for sd_type=NULL edge case (GAP-3) and batching (GAP-2); cleanup via beforeAll/afterAll with try/finally. ` +
  `Audit --execute test: MOCKED in CI default + bounded synthetic-data integration test gated behind ATOMIC_REVERT_EXECUTE_INTEGRATION=1. ` +
  `Test LOC estimate revised from 350 to 380-450 (14 scenarios + 1 shared helper). ` +
  `7 design warnings flagged (WARN-1..WARN-7) — most critical: WARN-2 (count>=275 drift) and WARN-5 (NULL sd_type three-valued logic). ` +
  `Verdict: PASS with warnings — PRD test_scenarios are a sound foundation; EXEC should incorporate the 6 additional scenarios and address the 7 design warnings as part of EXEC-1 through EXEC-5.`;

const row = {
  sd_id: SD_ID,
  sub_agent_code: SUB_AGENT_CODE,
  sub_agent_name: 'testing-agent',
  phase: PHASE,
  verdict: 'PASS',
  confidence: 89,
  summary,
  detailed_analysis: findings,
  warnings: [
    'GAP-1 (medium): FR-4 --execute mode test strategy underspecified for ~275 row mass-revert; recommend MOCKED for CI + bounded synthetic-data integration test gated behind env flag.',
    'GAP-2 (low): No test for batching-of-10 + progress reporting (TR-4); recommend synthetic 25-row fixture.',
    'GAP-3 (medium): View edge case sd_type=NULL not addressed; recommend COALESCE in DDL and TS-13.',
    'GAP-4 (low): No regression test for getInconsistentSDIds memoization (TR-3); recommend vi.fn() spy.',
    'GAP-5 (medium): preserve_metadata option in FR-1 signature has no test_scenario; recommend TS-14.',
    'WARN-1: View filter MUST use .eq(status, accepted) on SPH — verified witness has only rejected SPH rows.',
    'WARN-2: FR-2 AC-3 count>=275 will drift as audit script reverts ghosts; reword to count>=1 (witness) OR env-gate.',
    'WARN-3: console.warn-exactly-once test (TS-6) requires vi.resetModules() in beforeEach.',
    'WARN-4: Idempotency test (TS-2) must assert reverted_at timestamp equality (===), not just truthy.',
    'WARN-5: View three-valued logic with NULL sd_type — use COALESCE(sd_type,\\\"\\\") NOT IN (...) in DDL.',
    'WARN-6: Audit --filter validation must import CANONICAL_SD_TYPES from lib/sd/type-classifier.js (NOT hardcode).',
    'WARN-7: Vitest 4.x mocking patterns differ from 3.x in some edge cases — verify copy-paste from older tests.',
    'Recommend 14 total test_scenarios (8 PRD + 6 additions) and 380-450 LOC (vs PRD 350).',
    'Recommend extracting tests/helpers/static-pin.js (brace-depth slicer + red-green-red helper) for cross-SD reuse.'
  ]
};

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .insert(row)
  .select('id')
  .single();

if (error) {
  console.error('INSERT ERROR:', error);
  process.exit(1);
}

console.log('OK testing-agent PLAN row inserted:', data.id);
console.log('  sd_id:', SD_ID);
console.log('  sub_agent_code:', SUB_AGENT_CODE);
console.log('  phase:', PHASE);
console.log('  verdict:', row.verdict);
console.log('  confidence:', row.confidence);
console.log('  warnings:', row.warnings.length);
