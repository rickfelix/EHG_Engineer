#!/usr/bin/env node
/**
 * Write TESTING sub-agent EXEC-TO-PLAN verdict for SD-LEO-FIX-EVERY-CHAIRMAN-SMS-001
 * (chairman-SMS inbound `no_open_question` outcome, escalated from QF-20260913-173).
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict)
 * + canonical storage (lib/sub-agent-executor/results-storage.js storeSubAgentResults) —
 * no hand-rolled INSERT, per CLAUDE.md prologue rule 11.
 *
 * Gate-evidence provenance: test_execution carries the sha256 of the RUNNER-PRODUCED
 * vitest JSON report, not hand-authored counts.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';

const SD_ID = '179db363-b3bd-4e62-b805-90a627476626';
const SD_KEY = 'SD-LEO-FIX-EVERY-CHAIRMAN-SMS-001';

// Runner-produced artifacts (vitest --reporter=json), hashed at write time.
const TARGETED_ARTIFACT = '.artifacts/testing-evidence/sd-sms-targeted.json';
const TARGETED_SHA = 'e88029d47799f719f317151d428db5e3649d1117eec172a4b0d0118f122b97ae';
const FULL_ARTIFACT = '.artifacts/testing-evidence/sd-sms-full-unit.json';
const FULL_SHA = 'bab3df7d2425680cb27874d27f162b68749b54b400a4f78e3de82cd32b85b064';

const findings = [
  {
    id: 'F1-targeted-suite-green',
    severity: 'INFO',
    summary: 'Targeted suite EXECUTED (not assumed): `npx vitest run tests/unit/chairman/ tests/unit/coordinator/insert-coordination-row-callers-census.test.js` => 46 files passed, 784 tests passed, 0 failed (2.67s). Both new sms-bridge branch tests pass by name: "a terminal (already-decided) most-recent candidate logs \'no_open_question\', not \'no_match\' or \'expired\'" and "a terminal candidate with NO token at all (never SMS-eligible) still logs \'no_open_question\', not \'no_match\'".'
  },
  {
    id: 'F2-census-repin-verified',
    severity: 'INFO',
    summary: 'The EXEC-session census repair is CONFIRMED CORRECT by execution, not by reading the diff: insert-coordination-row-callers-census.test.js passes all 71 assertions, including the two that name the moved site — "lib/chairman/sms-bridge.js:1120 exists and contains insertCoordinationRow( within +/-3 lines" and "lib/chairman/sms-bridge.js:1120 carries an explicit, non-empty exemption reason" — plus the aggregate invariant "FR-2 + FR-3 entries total 26 real call sites across 26 distinct durable-caller files". The 1104->1120 re-pin is exactly the +16-line shift the new branch introduced.'
  },
  {
    id: 'F3-full-unit-tier-no-collateral',
    severity: 'INFO',
    summary: 'Full unit tier EXECUTED: `npx vitest run tests/unit` => 3642 files passed / 4 failed, 44559 tests passed / 1 failed / 292 skipped (271s). Zero chairman/ or coordinator/ suites failed (158 such suites ran, all green). The 4 failing files are unrelated to this SD and non-attributable: 3 are db-tier runtime-gated (eva/path-integrity-flags-live-defaults.db.test.js, roadmap/plan-of-record-remainder-view.db.test.js, stage-config/venture-stage-definition-consistency.db.test.js — all error DB_TIER_BLOCKED "no designated non-production target", an environment gate not a regression) and 1 is eva/complexity-scorer.test.js timing out at 60s while scanning process.cwd() (whole-repo filesystem walk; imports only scripts/eva/health-dimensions/*, touches no chairman/coordinator/sms code).'
  },
  {
    id: 'F4-no-other-hardcoded-outcome-enumerations',
    severity: 'INFO',
    summary: 'Swept for collateral enumerations of the widened CHECK-constraint value set. `no_open_question` appears in exactly 6 tracked files: the migration, lib/chairman/sms-bridge.js, lib/coordinator/insert-coordination-row-callers.cjs (comment), and the 3 test/gate files. The only other hit — scripts/modules/handoff/executors/lead-to-plan/gates/grill-convergence.js:53 — is the string `no_open_questions` (PLURAL), an unrelated grill-gate skip reason, NOT a collision with the sms_inbound_log outcome. No other module enumerates the 9 allowed outcome values.'
  },
  {
    id: 'F5-no-other-line-pinned-fixture-broken',
    severity: 'INFO',
    summary: 'Swept for other line-pinned censuses/fixtures referencing sms-bridge.js. The only other machine-read pin file is scripts/audit/count-truncation-overrides.json, whose sms-bridge.js entries pin lines 132/361/376/408/463/545/582 — ALL above the ~815-838 insertion point, therefore structurally unaffected by the shift. Remaining sms-bridge.js:NNN references (parked-sms-audit.mjs, ratification-capture-detector.mjs, sms-outbound-worker.js) are prose comments with no assertion reading them.'
  },
  {
    id: 'F6-unmatched-outcomes-exclusion-is-correct',
    severity: 'INFO',
    summary: 'PRIOR GAP (a) RESOLVED AS INTENTIONAL, not a wiring gap. UNMATCHED_OUTCOMES = [\'no_match\', \'ambiguous\'] (sms-bridge.js:86) feeds ONE thing: the FR-4 anti-abuse auto-suspend counter (sms-bridge.js:659), which degrades a flooding sender to notify-only. Excluding `no_open_question` is CONSISTENT with the list already excluding `rate_limited` and `expired`, and is semantically required: `no_open_question` is emitted ONLY when a real candidate notification to that phone exists and went terminal — i.e. the reply is provably GENUINE, merely late. Counting it toward suspension would penalise a real correspondent for answering slowly. Note the behavioural delta this fix creates: these events previously logged `no_match`, which IS counted, so the fix REMOVES a latent path by which late-but-genuine replies accrued suspension credit. For the chairman number that delta is inert (TS-7 exempts the verified chairman from the unmatched-flood counter); for any other notified phone it is a deliberate, correct loosening.'
  },
  {
    id: 'F7-GAP-terminal-test-assertion-is-non-discriminating',
    severity: 'LOW',
    summary: 'PRIOR GAP (b) STILL OPEN, and MEASURED to be broader than "looseness". tests/unit/chairman/sms-bridge.test.js:807 asserts `expect(row.parked_at || row.routed_at).toBeTruthy()` while its immediate sibling expired-case test asserts strict `expect(row.parked_at).toBeTruthy()`. I instrumented the case and RAN it: the actual values are parked_at=null, routed_at="2026-09-13T21:42:36.605Z" — the terminal case ROUTES to Adam and does NOT park. Two consequences. (1) The test TITLE ("no_open_question ... gets parked, same as no_match") mis-describes the measured behaviour; the behaviour is correct (it matches how no_match itself behaves for a verified chairman: routes, never parks — see the strict sms-relay-park.test.js routing tests) but the title asserts the opposite of what runs. (2) The disjunction is NON-DISCRIMINATING: it would still pass if routing silently regressed into parking, or vice versa.'
  },
  {
    id: 'F8-NEW-adam-routable-membership-has-no-strict-guard',
    severity: 'LOW',
    summary: 'NEW FINDING (not previously flagged). ADAM_ROUTABLE_OUTCOMES (sms-bridge.js:104) was widened to [\'no_match\',\'rate_limited\',\'no_open_question\'], but `git grep ADAM_ROUTABLE_OUTCOMES -- tests/` returns ZERO hits — the constant is neither exported nor covered by any contract test, unlike its sibling PARK_OUTCOMES which HAS a strict equality contract test (sms-relay-park.test.js:147 asserts the exact 5-element array). Combined with F7, the ONLY guard on `no_open_question` being Adam-routable is the non-discriminating `parked_at || routed_at` disjunction. So the newly-added routing membership is effectively unguarded: dropping \'no_open_question\' from ADAM_ROUTABLE_OUTCOMES would make the row park instead of route, and the entire suite would still be green. This is a consumer-side asymmetry (the park list has a writer-side contract test, the routing list does not), not a defect in shipped behaviour.'
  }
];

const recommendations = [
  'NON-BLOCKING (F7): tighten tests/unit/chairman/sms-bridge.test.js:807 to the measured behaviour — `expect(row.routed_at).toBeTruthy(); expect(row.parked_at).toBeFalsy();` — mirroring the strict no_match routing test in sms-relay-park.test.js, and correct the test title from "gets parked" to "routes to Adam (never parks)".',
  'NON-BLOCKING (F8): add a PARK_OUTCOMES-style strict contract test for ADAM_ROUTABLE_OUTCOMES (export it alongside PARK_OUTCOMES and assert toEqual([\'no_match\',\'rate_limited\',\'no_open_question\'])), so the routing membership of the new outcome is guarded by something that fails when it is removed.',
  'INFO: eva/complexity-scorer.test.js walks process.cwd() under a 60s timeout and is timing out in this worktree; unrelated to this SD but worth a harness_backlog note if it recurs on main.'
];

const summary = 'EXECUTED both the targeted and the full unit tiers. Targeted: 46 files / 784 tests, 100% pass, including both new no_open_question branch tests and the repaired insertCoordinationRow census (sms-bridge.js:1120). Full tier: 44559 passed / 1 failed, with the single failure and 3 file-level errors all non-attributable (3 db-tier-gated, 1 cwd-scan timeout in eva/). Zero collateral regressions from either the +16-line shift or the outcome-list widening: swept every other hardcoded outcome enumeration and every other line-pinned fixture referencing sms-bridge.js and found none broken. Prior gap (a) resolves as intentional and correct. Prior gap (b) remains open and, on measurement, is broader than reported — the assertion is non-discriminating and its title contradicts the measured behaviour — and it compounds with a NEW finding that ADAM_ROUTABLE_OUTCOMES has no contract test at all, leaving the new outcome\'s routing membership effectively unguarded. Shipped behaviour is correct; the gap is test strength on a new code path, so CONDITIONAL_PASS rather than PASS.';

const justification = `VERDICT BASIS — every number below came from a runner, not from reading a diff.

RAN #1 (targeted, artifact ${TARGETED_ARTIFACT} sha256 ${TARGETED_SHA}):
  npx vitest run tests/unit/chairman/ tests/unit/coordinator/insert-coordination-row-callers-census.test.js
  => Test Files 46 passed (46) | Tests 784 passed (784) | 0 failed | 2.67s

RAN #2 (full unit tier, artifact ${FULL_ARTIFACT} sha256 ${FULL_SHA}):
  npx vitest run tests/unit
  => Test Files 3642 passed | 4 failed | 23 skipped (3669)
  => Tests 44559 passed | 1 failed | 1 expected-fail | 292 skipped | 1 todo (44854) | 271.20s

RAN #3 (instrumented branch probe): injected a value-revealing assertion into a scratch copy of
the terminal-candidate test and executed it. Measured parked_at=null, routed_at=<timestamp>.
This is what converted prior gap (b) from "assertion looseness" into F7+F8 — the disjunction is
not merely loose, it is the sole guard on a production constant that no test names.

ATTRIBUTION OF THE 4 FAILING FILES: none touch lib/chairman/ or lib/coordinator/. Three fail
identically with DB_TIER_BLOCKED (runtime environment gate: "no designated non-production
target"). The fourth (eva/complexity-scorer.test.js) times out walking process.cwd(). All 158
chairman/ + coordinator/ suites passed.

WHY CONDITIONAL_PASS AND NOT PASS: the SD's shipped behaviour is correct and fully green, the
migration is applied, and the census repair is verified by execution. But the new
'no_open_question' routing membership (ADAM_ROUTABLE_OUTCOMES) is guarded only by an assertion
that cannot distinguish routed from parked, and by no contract test at all — removing the value
from that constant leaves the whole suite green. That is a printed discriminator, not an
enforced one. It does not block the EXEC-TO-PLAN handoff (behaviour verified correct by direct
measurement), but PLAN should carry the two test-strength conditions forward.`;

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 92,
    findings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [
      'NON-BLOCKING: tighten the terminal-candidate assertion to strict routed_at-truthy / parked_at-falsy and fix its contradicting title (F7).',
      'NON-BLOCKING: add a strict contract test for ADAM_ROUTABLE_OUTCOMES so the new outcome\'s routing membership is guarded (F8).',
    ],
    metadata: {
      measured: true,
      test_execution: buildTestExecution({
        executed: 44854,
        passed: 44559,
        failed: 1,
        skipped: 292,
        runner: 'vitest',
        artifactPath: FULL_ARTIFACT,
        artifactSha: FULL_SHA,
        source: 'sub_agent_runner',
      }),
      test_runs: [
        {
          scope: 'targeted (tests/unit/chairman/ + insert-coordination-row-callers-census)',
          cmd: 'npx vitest run tests/unit/chairman/ tests/unit/coordinator/insert-coordination-row-callers-census.test.js',
          files_passed: 46, files_failed: 0,
          tests_passed: 784, tests_failed: 0,
          duration_s: 2.67,
          artifact_path: TARGETED_ARTIFACT,
          artifact_sha256: TARGETED_SHA,
        },
        {
          scope: 'full unit tier',
          cmd: 'npx vitest run tests/unit',
          files_passed: 3642, files_failed: 4, files_skipped: 23,
          tests_passed: 44559, tests_failed: 1, tests_skipped: 292,
          duration_s: 271.20,
          artifact_path: FULL_ARTIFACT,
          artifact_sha256: FULL_SHA,
        },
      ],
      unattributable_failures: [
        { file: 'tests/unit/eva/path-integrity-flags-live-defaults.db.test.js', cause: 'DB_TIER_BLOCKED (no designated non-production target)' },
        { file: 'tests/unit/roadmap/plan-of-record-remainder-view.db.test.js', cause: 'DB_TIER_BLOCKED (no designated non-production target)' },
        { file: 'tests/unit/stage-config/venture-stage-definition-consistency.db.test.js', cause: 'DB_TIER_BLOCKED (no designated non-production target)' },
        { file: 'tests/unit/eva/complexity-scorer.test.js', cause: 'timeout 60s walking process.cwd(); no chairman/coordinator/sms import' },
      ],
      chairman_coordinator_suites_run: 158,
      chairman_coordinator_suites_failed: 0,
      census_repin_verified: 'lib/chairman/sms-bridge.js:1104 -> 1120 confirmed green by insert-coordination-row-callers-census.test.js (71 assertions, incl. the 26-site aggregate invariant)',
      collateral_sweeps: {
        outcome_enumerations: 'no_open_question in 6 tracked files; grill-convergence.js:53 hit is the PLURAL no_open_questions, unrelated',
        line_pinned_fixtures: 'scripts/audit/count-truncation-overrides.json pins sms-bridge.js lines 132..582, all above the ~815 insertion point — unaffected',
      },
      prior_gap_disposition: {
        'gap_a_unmatched_outcomes_exclusion': 'RESOLVED-INTENTIONAL (F6) — consistent with expired/rate_limited already excluded; no_open_question is provably a genuine reply',
        'gap_b_park_test_assertion_looseness': 'STILL OPEN and BROADER (F7) — measured parked_at=null/routed_at=set; title contradicts behaviour; assertion non-discriminating',
      },
      new_findings: ['F8: ADAM_ROUTABLE_OUTCOMES has zero test references — new routing membership unguarded'],
      migration_verified: 'database/migrations/20260913_sms_inbound_log_no_open_question.sql (9-value CHECK) reported applied live by EXEC; not re-applied by this run',
      branch: 'feat/SD-LEO-FIX-EVERY-CHAIRMAN-SMS-001',
      head_commit: '3ad7c192052',
      escalated_from: 'QF-20260913-173',
      model: 'Opus 5 (1M context)',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      phase_assessed: 'EXEC-TO-PLAN (post-implementation verification)',
      checks_performed: {
        targeted_suite_executed: '46 files / 784 tests, 0 failed',
        full_unit_tier_executed: '44559 passed / 1 failed',
        new_branch_tests_confirmed_by_name: 'both no_open_question branch tests pass',
        census_repin_executed: 'sms-bridge.js:1120 assertions green',
        outcome_enumeration_sweep: 'no other module enumerates the 9 allowed values',
        line_pin_fixture_sweep: 'no other machine-read pin affected by the +16-line shift',
        branch_behaviour_probed: 'instrumented run: terminal case routes (routed_at set), does not park',
        adam_routable_coverage_checked: 'zero test references to ADAM_ROUTABLE_OUTCOMES',
      },
    },
    phase: 'EXEC_TO_PLAN',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'QA Engineering Director (testing-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  console.log('  test_execution:', JSON.stringify(stored.metadata?.test_execution));
  process.exit(0);
}

main().catch((e) => { console.error('WRITE FAILED:', e); process.exit(1); });
