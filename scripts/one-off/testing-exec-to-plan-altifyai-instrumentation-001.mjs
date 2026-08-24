#!/usr/bin/env node
/**
 * One-off: TESTING sub-agent verification of SHIPPED CODE for
 * SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001, EXEC-TO-PLAN handoff.
 *
 * Commit under review: 313884be1aba9617e82e78ba08dd345e356b704b (10 files, +929/-14),
 * pushed as feat/SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001.
 *
 * Prior TESTING evidence on this SD: e7445772 (FAIL 90, PLAN-TO-EXEC, found invalid gateType,
 * the mislabeling risk, a stale migration comment) then 56dc6248 (CONDITIONAL_PASS 88,
 * PLAN-TO-EXEC re-review of the corrected PRD, found 2 pre-existing toEqual tests would break).
 *
 * This review independently re-derives the actual shipped diff (git show 313884be1ab) rather
 * than trusting the commit message, runs the full touched-area test suite, mutation-tests the
 * primary regression test itself (does not trust the commit message's claim that this was done),
 * and traces every _advanceStage() call site for a double-fire risk.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'c0d3fcc7-dfd8-4c00-a9e9-1ec49fe48f7f';
const SD_KEY = 'SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001';

const findings = [
  {
    id: 'diff-matches-description-5-return-points-confirmed',
    severity: 'INFO',
    summary: "Read lib/eva/stage-execution-worker.js:2363-2528 (_handleChairmanGate() in full, not just the cited hunks) directly against `git show 313884be1ab`. Confirmed exactly 5 return points now carry `source`, matching the intended split: :2391 source='autonomy_auto_approve' (checkAutonomy shortcut), :2398 source='governance_auto_approve' (_canAutoAdvance), :2470 source='fixture_venture_skip' (skipReason==='fixture_venture'), :2483 source='chairman_decision' (pre-existing approved row found on re-entry), :2512 source='chairman_decision' (waitForDecision resolves 'approved'). All other return points in the function (blocked:true/killed:true paths) correctly carry no source field -- they are irrelevant to the mislabeling risk since FR-1 only fires downstream of an approved advance.",
  },
  {
    id: 'advance-stage-call-site-placement-and-gate-confirmed',
    severity: 'INFO',
    summary: "lib/eva/stage-execution-worker.js:3260-3289: the new recordGateAttempt() call is the FIRST statement after the raw ventures UPDATE that sets current_lifecycle_stage (:3261-3264) and is gated on the exact string `result?._chairmanGateSource === 'chairman_decision'` (:3277), not a looser truthy check. Traced the tag's propagation: `result._chairmanGateSource = gateResult.source` is set at the ONE production call site of _handleChairmanGate() (:1432, inside the `if (result) { ... }` block at :1427), and that same mutated `result` object is passed as `context.result` into the 'governance_override' (:1506) and 'normal' (:1871) _advanceStage() call sites, where `_advanceStage()`'s destructure `const { result = null, ... } = context` (:2836) picks it up. Wrapped in the same non-fatal try/catch pattern as the 4 existing recordGateAttempt() call sites (confirmed: catch block only logs `this._logger.warn(...)`, never re-throws).",
  },
  {
    id: 'no-double-fire-risk-in-the-instrumented-pathway',
    severity: 'INFO',
    summary: "Traced all 7 call sites of _advanceStage() (lines 899, 1002, 1086, 1187, 1245, 1506, 1871). Each is immediately followed by either `break` (on advanceResult.blocked) or `currentStage = next*; continue` (on success) -- mutually exclusive, at most one _advanceStage() call per while-loop iteration. Since the raw ventures UPDATE is the function's FIRST side effect (before the new call), a subsequent poll tick reads the already-advanced stage from DB and never re-enters _handleChairmanGate() for the same fromStage. No realistic path found for the new call to fire twice for one genuine transition.",
  },
  {
    id: 'passed-field-omission-verified-against-actual-constraint',
    severity: 'INFO',
    summary: "recordGateAttempt()'s destructure (artifact-persistence-service.js:487-497) only defaults `resolvedOutcome = passed ? 'machine_pass' : 'machine_fail'` when resolvedOutcome is itself undefined -- the new call passes resolvedOutcome:'chairman_adjudicated' explicitly, so that default branch is never evaluated and `passed` being omitted is inert. Downstream, `p_passed: resolvedOutcome === 'machine_pass' ? true : resolvedOutcome === 'machine_fail' ? false : null` (:519) evaluates to null for 'chairman_adjudicated'. Cross-checked against the live migration (database/chairman-gated/20260823_eva_stage_gate_attempts.sql:112-117, esga_passed_matches_outcome CHECK): null is the ONLY value the constraint permits for any resolved_outcome outside machine_pass/machine_fail. The field removal is correct, not merely harmless.",
  },
  {
    id: 'new-test-1-exercises-the-real-method-not-a-reimplementation',
    severity: 'INFO',
    summary: "tests/unit/eva/stage-execution-worker-chairman-gate-source.test.js constructs a real `new StageExecutionWorker(...)` and calls the real `worker._handleChairmanGate(...)` in all 5 tests; only its external module dependencies (autonomy-model, chairman-decision-watcher, stage-governance, shared-services, orchestrator-state-machine) are mocked via vi.mock, mirroring the pre-existing accepted pattern in stage-execution-worker-fixture-venture-gate.test.js. Not fixture-blind: confirmed by running it (5/5 pass) and by reading its assertions against the real method's line numbers.",
  },
  {
    id: 'new-test-2-mutation-tested-independently-not-trusted-from-commit-message',
    severity: 'INFO',
    summary: "advance-stage-chairman-attempt-recording.test.js is a pure source-string-inspection suite (fs.readFileSync + string search over stage-execution-worker.js), not an executed call to _advanceStage() -- by design, per its own docstring, since _advanceStage() has 7+ .from() calls and 4 dynamic imports. Did NOT trust the commit message's claim that mutation-testing was already done: independently reverted the guard at :3277 from `result?._chairmanGateSource === 'chairman_decision'` to `result?._gateApproved`, ran the file, confirmed 3 of 6 tests fail for the right reason (the exact-string containment check, the placement-relative-to-guard check, and the try/catch-window-relative-to-guard check all fail because the guard substring no longer exists in source), then reverted the file back to the original guard and confirmed all 6 pass again (git diff on the file is empty post-restore). The primary regression test is genuinely load-bearing for this specific class of regression, within the stated limits of a string-inspection test (it cannot prove the dynamic import resolves at runtime or that argument names are correct beyond what the full test suite's successful module-load already implies).",
  },
  {
    id: 'full-touched-area-suite-passes-no-regressions',
    severity: 'INFO',
    summary: "`npx vitest run tests/unit/eva/` (the full eva unit-test directory, including files this SD did not touch that import/consume stage-execution-worker.js or artifact-persistence-service.js): 569 test files run, 1 failed (path-integrity-flags-live-defaults.db.test.js, a pre-existing, unrelated DB-tier-gated live-integration test that requires VITEST_DB_ALLOW_REF to be set for a non-production Supabase target -- fails identically on main, not a regression from this diff, and covers leo_feature_flags path-integrity kill switches, unrelated to chairman gates or stage advances). 7401 tests passed, 34 skipped. The 4 directly-touched test files (2 new, 2 updated) total 25 passing tests in isolation.",
  },
  {
    id: 'minor-commit-message-test-count-imprecision',
    severity: 'LOW',
    summary: "The commit message claims '48 tests pass across 6 files.' Running the 4 clearly-implicated files (2 new + 2 updated) gives 25 tests; adding 2 plausible unchanged-sibling candidates (stage-execution-worker-chairman-gate-rpc-error.test.js, stage-execution-worker-high-consequence-gate.test.js) gives 33, not 48 -- the exact 6-file set intended is not identifiable from the commit message alone. This is a documentation-precision nit, not a functional defect: the full tests/unit/eva/ suite (7401 tests) passes regardless of which 6 files the author had in mind.",
  },
  {
    id: 'pre-existing-adjacent-coverage-boundary-not-a-regression-out-of-scope',
    severity: 'LOW',
    summary: "A separate, pre-existing 'universalApproved' pre-execution shortcut (stage-execution-worker.js:826-911) can advance a venture past a NON-blocking stage with an already-approved chairman_decisions row WITHOUT ever calling _handleChairmanGate() in that iteration (it calls _advanceStage() at :899 with no `result` context, so the new source-gated call never fires for that specific advance). For BLOCKING/hard-gate stages specifically -- the actual semantic of a 'chairman gate' and the SD's stated target -- this same shortcut explicitly falls through to the isPreExecGate block and eventually still reaches _handleChairmanGate() at :1401 in the same iteration (confirmed by reading the 'BLOCKING stages fall through' comment at :909-910 and tracing isBlockingGate's effect), so the primary pathway this SD targets is not affected. The narrower non-blocking-stage case is unchanged pre-existing behavior (not touched by this diff) and was explicitly out of this SD's LEAD-narrowed scope; flagging as a follow-up candidate, not a blocking defect for this SD.",
  },
];

const warnings = [
  "FR-1's PRD acceptance criteria describe an end-to-end behavioral check ('after a [test] fixture successfully advances one stage via _advanceStage(), exactly one new eva_stage_gate_attempts row exists... a fixture where any chokepoint blocks the advance produces ZERO new attempt rows'). Neither new test file actually invokes the real _advanceStage() and observes a resulting DB row or RPC call; advance-stage-chairman-attempt-recording.test.js instead performs source-string inspection. This trade-off was pre-negotiated at PLAN-TO-EXEC (evidence 56dc6248, CONDITIONAL_PASS 88, TS-3) specifically because _advanceStage() was independently assessed there as too large/entangled (7+ .from() calls, 4 dynamic imports) to unit-test end-to-end -- this is a carried-forward, previously-accepted limitation, not a new gap introduced by EXEC.",
];

const recommendations = [
  "Non-blocking, for a future SD: consider whether the 'universalApproved' pre_exec_skip shortcut for NON-blocking stages should also carry a decision-source tag through to _advanceStage(), for completeness of the eva_stage_gate_attempts ledger outside the blocking/hard-gate pathway this SD targets.",
  "No further correction required before proceeding past EXEC-TO-PLAN -- both LOW findings are documentation/completeness nits, not defects in the shipped diff.",
];

const summary = "TESTING verification of the SHIPPED CODE (commit 313884be1ab, 10 files +929/-14) for SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 at EXEC-TO-PLAN, independently re-deriving the implementation from `git show` rather than trusting the commit message. All 5 of _handleChairmanGate()'s tagged return points were re-read in full and confirmed correctly split (2 chairman_decision, 3 automated-bypass). The new recordGateAttempt() call in _advanceStage() is confirmed placed strictly after the raw ventures UPDATE, gated on the exact string 'chairman_decision' (not a looser truthy check), and wrapped in a non-fatal try/catch. Traced the `_chairmanGateSource` tag's propagation from its one production write site (:1432) through to both _advanceStage() call sites that pass a `result` context, confirming the wiring is real, not just described. All 7 _advanceStage() call sites were checked for a double-fire risk: each sits in a mutually-exclusive continue/break branch, and since the raw stage UPDATE is the function's first side effect, a re-polled venture can never re-enter the gate for an already-advanced stage -- no double-fire path found. The `passed` field omission was verified correct (not merely harmless) against the live migration's esga_passed_matches_outcome CHECK constraint. Independently mutation-tested the primary regression test myself (did not trust the commit message's claim): reverted the guard string, confirmed 3 of 6 tests in advance-stage-chairman-attempt-recording.test.js fail for the right reason, restored, confirmed all 6 pass again with zero residual diff. The full tests/unit/eva/ suite passes (7401 passed, 34 skipped, 1 unrelated pre-existing DB-tier-gated failure that fails identically on main). Two LOW-severity, non-blocking observations: the commit message's '48 tests across 6 files' claim could not be exactly reproduced (a documentation nit only), and a separate pre-existing 'universalApproved' shortcut path for NON-blocking stages bypasses the new instrumentation -- but the actual blocking/hard-gate pathway this SD targets is unaffected, and this is unchanged, pre-existing, out-of-scope behavior, not a regression.";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 92,
    findings,
    warnings,
    recommendations,
    summary,
    justification: "The shipped diff (313884be1ab) matches its own commit-message description exactly on independent re-read against the actual file content, not just the diff hunks. The primary regression-guard test (advance-stage-chairman-attempt-recording.test.js) was mutation-tested by THIS review, not trusted from the commit message: reverting the guard string caused 3/6 tests to fail for the right reason, and restoring it returned the file to a byte-identical, zero-diff state with all 6 tests passing again. All 7 _advanceStage() call sites were traced and none present a double-fire risk, because the raw ventures UPDATE (the function's first side effect) already moves the persisted stage before the new call runs, so a re-polled venture can never re-enter the same gate for the same transition. The `passed` field omission was checked against the live migration's CHECK constraint (esga_passed_matches_outcome) and is the only value the constraint permits for this resolved_outcome, not merely an assumed-safe simplification. Two LOW-severity findings are recorded for completeness (a commit-message test-count imprecision, and a pre-existing, out-of-scope coverage boundary on a different, non-blocking-stage code path) but neither is a defect in the reviewed diff.",
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC-TO-PLAN',
      commit_reviewed: '313884be1aba9617e82e78ba08dd345e356b704b',
      prior_testing_evidence: ['e7445772-d9a7-4381-a539-ee896ff1d012 (FAIL 90, PLAN-TO-EXEC)', '56dc6248 (CONDITIONAL_PASS 88, PLAN-TO-EXEC re-review)'],
      mutation_test_performed_by_this_review: {
        target: "lib/eva/stage-execution-worker.js:3277 guard condition",
        mutation: "result?._chairmanGateSource === 'chairman_decision' -> result?._gateApproved",
        result: "3 of 6 tests in advance-stage-chairman-attempt-recording.test.js failed for the correct reason (exact-string containment, placement-relative-to-guard, try/catch-window-relative-to-guard)",
        restored: true,
        post_restore_diff: "empty (confirmed via `git diff` on the file)",
      },
      test_suite_results: {
        directly_touched_files: '25 tests passed across 4 files',
        full_eva_directory: '7401 passed, 34 skipped, 1 failed (pre-existing, unrelated, environment-gated .db.test.js, fails identically on main)',
      },
      double_fire_analysis: 'All 7 _advanceStage() call sites (lines 899, 1002, 1086, 1187, 1245, 1506, 1871) traced; each is in a mutually-exclusive continue/break branch, and the raw ventures UPDATE precedes the new call as the function\'s first side effect, preventing re-entry into the same gate for an already-advanced stage on a subsequent poll.',
      passed_field_verification: "Confirmed against database/chairman-gated/20260823_eva_stage_gate_attempts.sql:112-117 (esga_passed_matches_outcome CHECK) that passed MUST be NULL for resolved_outcome='chairman_adjudicated' -- the field omission is the only constraint-satisfying choice, not merely inert.",
    },
    phase: 'EXEC-TO-PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'Enhanced QA Engineering Director v2.4.0' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
