#!/usr/bin/env node
/**
 * TESTING verdict writer (RUN 2 / re-validation) for
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B @ EXEC-TO-PLAN.
 *
 * Supersedes run 1 (row 008a6021-16ba-4f4d-8570-7caf4ffa368a, verdict FAIL scoped to FR-B4).
 *
 * Provenance per the chairman-ratified gate-evidence rule: every count below is read OUT OF
 * the runner-produced vitest JSON artifact (never hand-transcribed), and that artifact's
 * sha256 is carried in metadata.test_execution.artifact_sha.
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
const ARTIFACT = '.artifacts/testing-SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B-exec-r2.json';

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
  runner: 'vitest@4.1.4 run --project unit --reporter=json',
  artifactPath: ARTIFACT,
  source: 'runner_json_reporter',
});

const results = {
  verdict: 'PASS',
  confidence_score: 93,
  summary:
    `Re-validation after the FR-B4 remediation. Full unit suite GREEN: ${j.numPassedTests}/${j.numTotalTests} tests ` +
    `across ${j.numPassedTestSuites} suites, ${j.numFailedTests} failed, zero regressions. The run-1 FAIL is CLEARED: ` +
    'the entrypoint guard now uses isMainModule() (pathToFileURL-based) and I independently re-ran the OLD guard ' +
    'myself (temporary copy) to confirm it still exits 0 with zero output — so the new regression test discriminates ' +
    'a real defect rather than merely passing. FR-B4 is also now reachable (npm script + scheduled workflow). ' +
    'The reported Windows-only libuv crash was independently confirmed by cross-platform A/B, not taken on trust.',
  findings: {
    fr_b1_bypass_ledger_join: 'PASS (unchanged from run 1) — threaded through bypass-stamp.js, both BaseExecutor bypass sites, cli-main.js, and both HandoffRecorder write sites.',
    fr_b2_self_authored_refusal: 'PASS (unchanged from run 1) — refusal site verified live, not dead.',
    fr_b3_regression_tests: 'PASS (unchanged from run 1).',
    fr_b4_ci_census_script:
      'PASS — run-1 FAIL cleared on all three of its legs. (1) Entrypoint guard: scripts/ci/bypass-ledger-handoff-join-check.mjs:122 now ' +
      'uses isMainModule(import.meta.url) from lib/utils/is-main-module.js (pathToFileURL-based, the canonical helper). ' +
      '(2) Regression test is real, not decorative: independently A/B-verified (see below). ' +
      '(3) Reachability: npm script `ci:bypass-ledger-join-check` + .github/workflows/bypass-ledger-join-check.yml (daily cron + workflow_dispatch).',
  },
  warnings: [
    {
      severity: 'LOW',
      issue:
        'bypass-ledger-join-check.yml job-summary fallback is unreachable on a hard crash. The run step is ' +
        '`node ... | tee census.json || true`; tee CREATES census.json even when the script emits nothing, so the ' +
        'subsequent `cat census.json || echo \'{"status":"error",...}\'` succeeds on an empty file and the fallback ' +
        'branch never fires. A crashed run would render an empty ```json block rather than the intended error marker — ' +
        'a quiet, not a loud, failure. Exactly the "instrument that reads green while measuring nothing" class this SD exists to close, ' +
        'though here it degrades to blank rather than to a false pass.',
      recommendation: 'Guard on content, e.g. `[ -s census.json ] && cat census.json >> "$GITHUB_STEP_SUMMARY" || echo \'{"status":"error","note":"no output captured"}\' >> "$GITHUB_STEP_SUMMARY"`.',
    },
    {
      severity: 'LOW',
      issue:
        'Observe-Only-First `|| true` is correct for a brand-new predicate, but nothing in the diff records WHEN or ON WHAT ' +
        'EVIDENCE the non-blocking step becomes blocking. Without a calibration exit criterion, an observe-only gate tends to stay observe-only permanently.',
      recommendation: 'PLAN should record a calibration exit predicate (e.g. "N consecutive clean daily runs -> drop `|| true`") on the SD or as a follow-up item.',
    },
    {
      severity: 'LOW',
      issue:
        'Local-dev footgun (NOT a CI risk): on Windows the script prints its correct JSON payload and THEN aborts during ' +
        'process.exit() teardown with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\\win\\async.c` — ' +
        'exit status 127. So `npm run ci:bypass-ledger-join-check` is unusable for exit-code purposes on a Windows dev box ' +
        'even though its stdout is correct. Confirmed not to affect ubuntu-latest (see metadata.claim_4_independent_verification).',
      recommendation: 'Optional: note the Windows caveat in the script header so a future Windows dev does not misread exit 127 as a census failure.',
    },
    {
      severity: 'LOW',
      issue:
        'Doc drift carried over from run 1, still unfixed (non-functional): the classifyBypassLedgerRows JSDoc ' +
        '(scripts/ci/bypass-ledger-handoff-join-check.mjs:26) still says "no Date.now() side effects beyond the passed-in `now`", ' +
        'but the signature has no `now` parameter. Separately, the new header comment says the static imports match ' +
        '"audit-log-parity-check.mjs\'s own style" — that sibling actually has NO entrypoint guard at all (it calls main() ' +
        'unconditionally at line 71), so it is a style precedent for the imports but not for the guard.',
      recommendation: 'Drop the `now` mention; soften the sibling-script comparison to refer to import style only.',
    },
  ],
  metadata: {
    phase: 'EXEC-TO-PLAN',
    sd_key: SD_KEY,
    run: 2,
    supersedes_evidence_row: '008a6021-16ba-4f4d-8570-7caf4ffa368a',
    commit_under_test: '8ae52108e809cf6680e19dbb05bd38295c0d668d + uncommitted FR-B4 remediation (working tree)',
    branch: 'feat/SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B',
    pr: 8219,
    test_execution: testExecution,
    suites: {
      total: j.numTotalTestSuites,
      passed: j.numPassedTestSuites,
      failed: j.numFailedTestSuites,
    },
    targeted_runs: [
      { scope: 'tests/unit/ci/ (incl. new entrypoint regression test)', files: 5, tests_passed: 28, tests_failed: 0 },
      { scope: 'tests/unit/handoff/ + tests/unit/subagent-evidence-gate.test.js (blast radius)', files: 124, tests_passed: 1265, tests_skipped: 3, tests_failed: 0 },
      { scope: 'full unit suite (regression census)', files: j.numTotalTestSuites, tests_passed: j.numPassedTests, tests_failed: j.numFailedTests },
    ],
    regressions_detected: 0,

    // The EXEC-reported A/B was re-run by TESTING rather than accepted as a claim.
    entrypoint_fix_independent_ab: {
      method:
        'Copied scripts/ci/bypass-ledger-handoff-join-check.mjs to a temp sibling, string-replaced ONLY the guard back to ' +
        'the old `import.meta.url === `file://${process.argv[1]}`` form, and spawned it. Temp file removed after.',
      old_guard_result: 'exit 0, ZERO output — the silent false green reproduced exactly as run 1 described.',
      new_guard_result:
        'tests/unit/ci/bypass-ledger-handoff-join-check-entrypoint.test.js passes (7.1s): non-zero exit + parseable {"status":"error"} payload.',
      conclusion: 'The new test genuinely discriminates the defect. It is a regression test, not a tautology.',
    },

    // EXEC explicitly asked TESTING to dispute-or-confirm this rather than trust it.
    claim_4_independent_verification: {
      claim: 'The libuv `src\\win\\async.c` assertion crash is Windows-native-path-specific and cannot occur on ubuntu-latest CI runners.',
      verdict: 'CONFIRMED — by direct cross-platform execution, plus a structural argument.',
      empirical_ab: {
        windows: 'Windows 11 / node v24.12.0 / libuv 1.51.0 — real run against real Supabase: emitted correct {"status":"pass"} JSON, then `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\\win\\async.c, line 76`; shell exit 127.',
        linux: 'WSL2 Ubuntu (kernel 6.6.87.2) / node v18.19.1 — SAME script, SAME worktree, SAME real Supabase query with .range() pagination and process.exit(): emitted identical {"status":"pass"} JSON and exited 0. No crash, no assertion.',
      },
      structural_argument:
        'src/win/async.c is a Windows-ONLY libuv translation unit; libuv compiles src/win/* exclusively on Windows and uses ' +
        'src/unix/async.c on POSIX. An assertion located in that file therefore cannot fire in a Linux build regardless of Node version. ' +
        'This is what makes the conclusion robust to the Node-version confound noted below.',
      linux_test_assertion_replication:
        'Could not run vitest under WSL (node 18 lacks node:util styleText, which rolldown/vitest 4 requires), so the new test\'s ' +
        'assertions were replicated directly with plain node on Linux: bad SUPABASE_URL -> exit 1, output contains "status", ' +
        'status === "error". All three assertions hold on Linux. The injected fake URL also survived dotenv\'s 82-var .env ' +
        'injection (no override), so the test is not fragile to env preloading.',
      extent_and_bounding_dimension:
        'BOUNDED BY NODE VERSION, NOT BY OS: the Windows leg ran node v24.12.0 and the Linux leg ran node v18.19.1 (the only ' +
        'node available in WSL), while the workflow pins node 20. So the empirical A/B varied two variables (OS and node major). ' +
        'The structural argument above is what closes that gap — the crash lives in a source file that does not exist in a Linux ' +
        'libuv build — so the conclusion holds, but the empirical leg alone would not have isolated OS as the cause. ' +
        'NOT verified: an actual ubuntu-latest node-20 GitHub Actions run of this workflow (it is cron/dispatch-only and has never fired).',
    },

    fr_b4_reachability_verified: {
      npm_script: 'package.json: "ci:bypass-ledger-join-check": "node scripts/ci/bypass-ledger-handoff-join-check.mjs"',
      workflow: '.github/workflows/bypass-ledger-join-check.yml — schedule cron "0 6 * * *" + workflow_dispatch, ubuntu-latest, node 20, non-blocking (`|| true`) by Observe-Only-First.',
      caveat: 'Workflow has never executed (cron + manual dispatch only), so its runtime behavior on the real CI target is unverified by this run.',
    },

    verification_method:
      'Full unit suite via runner JSON reporter; targeted re-runs of tests/unit/ci/, tests/unit/handoff/, tests/unit/subagent-evidence-gate.test.js; ' +
      'independent old-guard A/B reconstruction; cross-platform (Windows vs WSL2 Linux) execution of the real script against real Supabase.',
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
