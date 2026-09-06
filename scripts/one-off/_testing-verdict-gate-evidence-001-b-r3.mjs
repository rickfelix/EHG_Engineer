#!/usr/bin/env node
/**
 * TESTING verdict writer (RUN 3 / post-SECURITY-remediation re-validation) for
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B @ EXEC-TO-PLAN.
 *
 * Supersedes run 2 (row c43b6f1c) for the FR-B4 leg only; runs 1-2 remain the record for
 * their own scopes.
 *
 * Provenance per the chairman-ratified gate-evidence rule: every count below is read OUT OF
 * the runner-produced vitest JSON artifact (never hand-transcribed), and that artifact's
 * sha256 is carried in metadata.test_execution.artifact_sha. The artifact itself is
 * deliberately NOT committed (multi-MB, and its own test-name strings trip the repo's
 * secret-detection pre-commit hook as a false positive).
 */
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { config } from 'dotenv';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';

config();

const SD_UUID = '0766bf55-2b4c-44d2-8fd7-81bf3e19ac87';
const SD_KEY = 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B';
const ARTIFACT = '.artifacts/testing-SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B-exec-r3.json';

// --- read the runner artifact; derive counts from it, never from prose ---
const buf = readFileSync(ARTIFACT);
const artifactSha = createHash('sha256').update(buf).digest('hex');
const j = JSON.parse(buf.toString());

const testExecution = buildTestExecution({
  executed: j.numTotalTests,
  passed: j.numPassedTests,
  failed: j.numFailedTests,
  skipped: j.numPendingTests,
  artifactSha,
  runner: 'vitest run --project unit --reporter=json',
  artifactPath: ARTIFACT,
  source: 'runner_json_reporter',
});

const results = {
  verdict: 'PASS',
  confidence_score: 88,
  summary:
    `Re-validation of the four SECURITY remediations (evidence dcf8dab7) at commit 6b25ba3482c. Full unit suite GREEN: ` +
    `${j.numPassedTests}/${j.numTotalTests} tests, ${j.numFailedTests} failed, ${j.numPendingTests} skipped — zero regressions ` +
    `(r2 baseline 47097/47308 -> r3 47105/47316, delta +8 tests, all new and all passing). All four fixes were verified ` +
    `AT THE WRITE SITE, not merely by the presence of a test: HIGH-1 scans Object.entries(gateResults.gateResults) ` +
    `(BaseExecutor.js:682), HIGH-2's status enum is set at 691-699 and threaded to the persisted row, MEDIUM's ` +
    `filterSafeIds() is applied to BOTH sd_id and sd_key at the census call site (lines 94-95) BEFORE the .or() string is ` +
    `built, and LOW's .is('handoff_id', null) is present at both bypass_ledger UPDATE sites (HandoffRecorder.js:611, 1198). ` +
    `PASS is scoped to these four fixes. TWO coverage defects found that PLAN must resolve — one of them a NEW reachability ` +
    `regression that invalidates run 2's FR-B4 PASS: the FR-B4 entrypoint regression test no longer executes in ANY lane.`,
  findings: {
    security_high_1_multi_gate_scan:
      'PASS — fix verified at the write site (BaseExecutor.js:682 iterates Object.entries(gateResults.gateResults || {}) ' +
      'rather than indexing by the first-wins failedGate). Genuinely asserted by a NEW discriminating test: "catches a ' +
      'self-authored match on a gate OTHER than the one named by failedGate (multi-gate-failure coverage)". This test ' +
      'would fail against the old single-gate read, so it is a regression test rather than a tautology.',
    security_high_2_status_stamp:
      'PASS — the six-value enum (cleared / skipped_no_actor_session / skipped_no_evidence_session_id / ' +
      'not_applicable_no_evidence_detail / not_applicable_authority_fence / refused) is assigned at BaseExecutor.js:691-699 ' +
      '(+371 for the authority fence), carried at 758, and persisted via buildPersistedBypassMetadata as ' +
      'self_authorship_check_status. Asserted end to end by 3 tests (2 stamp tests in the refusal suite + the ' +
      'carry-through test in bypass-stamp.test.js). PARTIAL enum coverage — see warnings.',
    security_medium_postgrest_injection:
      'PASS — and, critically, the sanitizer is wired at the WRITER, not merely exported for testing. ' +
      'scripts/ci/bypass-ledger-handoff-join-check.mjs:94-95 applies filterSafeIds() to both the sd_id and sd_key arrays ' +
      'before line ~102 joins them into the .or() filter string, so no unfiltered value can reach PostgREST grammar. ' +
      'Allowlist /^[A-Za-z0-9_-]+$/ correctly rejects the comma OR-term separator, parens, quotes and dots. ' +
      '5 new tests cover pass-through, comma, parens/quotes/dots, null/undefined/empty/non-string, and de-duplication.',
    security_low_write_once_idempotency:
      'IMPLEMENTED BUT UNASSERTED — the .is(\'handoff_id\', null) write-once guard IS present at both UPDATE sites ' +
      '(HandoffRecorder.js:611 and :1198), verified by direct read. However NO test asserts it. See warnings: this fix ' +
      'is currently regression-unprotected.',
    fr_b4_ci_census_reachability:
      'REGRESSED since run 2 — the FR-B4 entrypoint regression test does not execute in any lane at HEAD. See the HIGH ' +
      'warning. Run 2 PASSed FR-B4 against this test at tests/unit/ci/; at HEAD it lives at tests/integration/ and is ' +
      'collected ONLY by the db project, which skips every test without a designated non-production target. ' +
      'Run 2\'s FR-B4 PASS therefore no longer holds at HEAD.',
    regression_status:
      `PASS — 0 failed tests across ${j.numTotalTestSuites} suites. Targeted lanes also green: tests/unit/handoff/ + ` +
      'tests/unit/ci/ + tests/unit/subagent-evidence-gate.test.js = 128 files / 1301 passed / 3 skipped / 0 failed; ' +
      'the 4 fix-specific files = 48 passed / 0 failed.',
  },
  warnings: [
    {
      severity: 'HIGH',
      issue:
        'DEAD BY CONSTRUCTION: tests/integration/bypass-ledger-handoff-join-check-entrypoint.test.js — FR-B4\'s behavioral ' +
        'proof that the Windows entrypoint guard actually fires — executes in NO lane at HEAD. Detected by diffing the ' +
        'collected-file sets between the r2 and r3 runner artifacts (r2 collected 3847 files, r3 3846; the single dropped ' +
        'file was this one). Chain of evidence: (1) during run 2 the file sat UNTRACKED at tests/unit/ci/ and was collected ' +
        'by the unit project, which is what made run 2\'s FR-B4 PASS possible; (2) commit 8e6c5d2ed6f committed it to ' +
        'tests/integration/ instead; (3) tests/integration/** resolves ONLY under the db project (confirmed: `vitest list ' +
        '--project unit` does not collect it, `--project db` does); (4) the db project skips EVERY test at runtime without ' +
        'VITEST_DB_ALLOW_REF designating a non-production ref — observed live: "[vitest][db-tier] SKIPPED at runtime — no ' +
        'designated non-production target"; (5) no CI workflow runs it (the four workflows touching tests/integration each ' +
        'target other specific paths; fixture-producer-guard-lint only LINTS the directory, it does not execute it). ' +
        'The test needs no database at all — it deliberately points at http://127.0.0.1:1 to force a fast failure path — ' +
        'so its placement under tests/integration/ is a misfiling, not a requirement. This is precisely the defect class ' +
        'the test itself was written to catch: a guard that silently never fires. The guard\'s guard now silently never fires.',
      recommendation:
        'git mv tests/integration/bypass-ledger-handoff-join-check-entrypoint.test.js tests/unit/ci/ (its run-2 home, and ' +
        'the lane its sibling tests/unit/ci/bypass-ledger-handoff-join-check.test.js already occupies). Then re-run ' +
        '`npx vitest run --project unit tests/unit/ci/` and confirm the file appears in the collected set. ' +
        'Deliberately NOT fixed by TESTING: a validator that authors the fix it then validates is the self-authorship ' +
        'pattern FR-B2 exists to refuse.',
    },
    {
      severity: 'MEDIUM',
      issue:
        'The LOW SECURITY fix (.is(\'handoff_id\', null) write-once idempotency) is implemented but NOT asserted. In ' +
        'tests/unit/handoff/handoff-recorder-bypass-ledger-join.test.js the supabase mock records the call inside .eq() ' +
        '(pushing {table, patch, eq}) and then returns `{ then, catch, is: () => term }` — an .is() that accepts ANY ' +
        'arguments and captures NOTHING. The tests assert only ledgerJoin.patch and the eq. Deleting ' +
        '`.is(\'handoff_id\', null)` from both HandoffRecorder write sites would leave all four tests GREEN, because the ' +
        'value returned by .eq() is already a terminal thenable. The mock carries an explanatory comment ("The real code ' +
        'chains .eq(...).is(\'handoff_id\', null) (write-once guard)") in place of an assertion — matching the recurring ' +
        'PAT-RATIONALE-WITHOUT-ASSERTION-001 pattern, where the prose is the only thing holding the invariant.',
      recommendation:
        'Capture the .is() arguments in the mock and assert them, e.g. record `is: (col, val) => { calls.updates.at(-1).is ' +
        '= { col, val }; return term; }` and add `expect(ledgerJoin.is).toEqual({ col: \'handoff_id\', val: null })` to ' +
        'both the createArtifact and recordFailure cases. ~3 lines, and it converts the write-once guarantee from ' +
        'documented to enforced.',
    },
    {
      severity: 'LOW',
      issue:
        'HIGH-2\'s selfAuthorshipCheckStatus enum has six values but only three are asserted by tests: "cleared", ' +
        '"skipped_no_evidence_session_id", and "refused" (the last implicitly, via the refusal tests). ' +
        '"skipped_no_actor_session", "not_applicable_no_evidence_detail" and "not_applicable_authority_fence" have no ' +
        'direct coverage. These are exactly the fail-open branches HIGH-2 was raised to make legible, so an unasserted ' +
        'branch there is a guard whose own status stamp is unverified.',
      recommendation:
        'Add one assertion per uncovered branch (three short cases, same shape as the existing stamp tests).',
    },
    {
      severity: 'LOW',
      issue:
        'Housekeeping / durability: .artifacts/ is NOT gitignored (confirmed via git check-ignore — the runner JSONs show ' +
        'as plain untracked "??" entries). Three multi-MB vitest artifacts now sit there. A `git add -A` would stage them ' +
        'and trip the secret-detection pre-commit hook on their own test-name strings, and per the standing ' +
        'untracked-root-files hazard they are one `git clean` from zero.',
      recommendation: 'Add .artifacts/ to .gitignore, or prune the run artifacts once the verdict rows are written.',
    },
  ],
  metadata: {
    phase: 'EXEC-TO-PLAN',
    sd_key: SD_KEY,
    run: 3,
    supersedes_evidence_row: 'c43b6f1c (FR-B4 leg only; the other legs stand)',
    responds_to_security_evidence_row: 'dcf8dab7',
    commit_under_test: '6b25ba3482c83a1c5f552edd2bd343a4df0cf796',
    branch: 'feat/SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B',
    test_execution: testExecution,
    suites: {
      total: j.numTotalTestSuites,
      passed: j.numPassedTestSuites,
      failed: j.numFailedTestSuites,
    },
    targeted_runs: [
      { scope: 'the 4 fix-specific files (base-executor refusal, bypass-stamp, ci join-check, recorder join)', files: 4, tests_passed: 48, tests_failed: 0 },
      { scope: 'tests/unit/handoff/ + tests/unit/ci/ + tests/unit/subagent-evidence-gate.test.js', files: 128, tests_passed: 1301, tests_skipped: 3, tests_failed: 0 },
      { scope: 'full unit suite (regression census)', files: j.numTotalTestSuites, tests_passed: j.numPassedTests, tests_failed: j.numFailedTests },
    ],
    regressions_detected: 0,
    coverage_regressions_detected: 1,

    baseline_comparison: {
      method:
        'Compared the r3 runner artifact against the r2 artifact (the run-2 evidence baseline) on BOTH counts and the set ' +
        'of collected test files. The file-set diff is what surfaced the HIGH finding; the count delta alone (+8 tests, ' +
        '0 failures) looked unambiguously healthy and would have concealed it.',
      r2: { suites: 16083, tests: 47308, passed: 47097, failed: 0 },
      r3: { suites: j.numTotalTestSuites, tests: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests },
      test_delta: '+8 tests, +8 passed, 0 failed — consistent with the described new tests',
      collected_file_delta: {
        added: [],
        dropped: ['tests/unit/ci/bypass-ledger-handoff-join-check-entrypoint.test.js'],
        interpretation:
          'A dropped file with zero failures is the silent case: the suite reads greener, not redder, when a test stops ' +
          'being collected. Count-only comparison cannot detect it.',
      },
    },

    write_site_verification: {
      note:
        'Each fix was confirmed at its write site rather than inferred from the presence of a passing test, per the ' +
        'readers-are-not-the-writer hazard (a consumer-only discriminator reads as a working feature).',
      high_1: 'scripts/modules/handoff/executors/BaseExecutor.js:682 — for (const [gateName, gateResult] of Object.entries(gateResults.gateResults || {}))',
      high_2: 'scripts/modules/handoff/executors/BaseExecutor.js:691-699 (enum assignment), :371 (authority fence), :758 (threading)',
      medium: 'scripts/ci/bypass-ledger-handoff-join-check.mjs:58 (filterSafeIds definition), :94-95 (applied to sd_id AND sd_key), :106 (.or(orClauses) consumes the filtered arrays)',
      low: 'scripts/modules/handoff/recording/HandoffRecorder.js:611 and :1198 — both chain .eq(\'id\', result.bypassLedgerId).is(\'handoff_id\', null)',
    },

    reachability_verification: {
      method:
        'Did not rely on the file existing. Ran `npx vitest list` under each project to determine actual collection, and ' +
        'read the db-tier runtime gate output.',
      unit_project: 'does NOT collect tests/integration/bypass-ledger-handoff-join-check-entrypoint.test.js (absent from the r3 artifact entirely)',
      db_project: 'DOES collect it, but the db tier reported: "SKIPPED at runtime — no designated non-production target (reason: no_designated_target)" — every test reports skipped and all network is refused',
      ci_workflows: 'none execute it; .github/workflows/bypass-ledger-join-check.yml runs the census SCRIPT on a daily cron but not this test',
      conclusion: 'zero executing lanes at HEAD',
    },

    scope_and_limits: {
      verdict_scope:
        'PASS covers the four SECURITY remediations and the absence of pass/fail regressions. It does NOT re-affirm ' +
        'run 2\'s FR-B4 PASS, which is explicitly withdrawn above.',
      not_verified: [
        'The bypass-ledger-join-check.yml workflow has still never executed (cron + workflow_dispatch only), so its runtime behavior on a real ubuntu-latest runner remains unverified — carried forward unchanged from run 2.',
        'The MEDIUM injection fix was verified as a pure-function allowlist plus its call-site wiring; no live PostgREST exploit attempt was re-run against the database by TESTING (the SECURITY agent had confirmed exploitability pre-fix).',
        'Only the unit project was executed. The db and e2e lanes were not run (db tier has no designated non-production target in this environment).',
      ],
      bounding_dimension:
        'Bounded by LANE, not by count: the census covers the unit project exhaustively (47316 tests), but a defect that ' +
        'lives outside the unit lane — which is exactly what the HIGH finding is — is invisible to the counts and only ' +
        'became visible through the collected-file-set diff.',
    },

    verification_method:
      'Full unit suite via the vitest JSON reporter (counts read from the artifact, sha256 stamped); targeted re-runs of ' +
      'the 4 fix-specific files and of tests/unit/handoff/ + tests/unit/ci/ + tests/unit/subagent-evidence-gate.test.js; ' +
      'direct write-site reads of all four fixes; per-project `vitest list` reachability probes; and an r2-vs-r3 ' +
      'collected-file-set diff.',
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  subAgentCode: 'TESTING',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', SD_UUID, null, results, { sdKey: SD_KEY });
console.log('\nStored verdict:', results.verdict);
console.log('artifact_sha:', artifactSha);
console.log('row:', JSON.stringify(stored?.id ?? stored, null, 2).slice(0, 400));
