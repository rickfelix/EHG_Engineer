#!/usr/bin/env node
/**
 * TESTING verdict writer for SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B @ EXEC-TO-PLAN.
 *
 * Provenance per the chairman-ratified gate-evidence rule: the numbers below are read
 * OUT OF the runner-produced vitest JSON artifact (not hand-transcribed), and that
 * artifact's sha256 is carried in metadata.test_execution.artifact_sha.
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
const ARTIFACT = '.artifacts/testing-SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B-exec.json';

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
  runner: 'vitest@4.1.4 run --project unit',
  artifactPath: ARTIFACT,
  source: 'runner_json_reporter',
});

const results = {
  verdict: 'FAIL',
  confidence_score: 92,
  summary:
    `Full unit suite GREEN with zero regressions (${j.numPassedTests}/${j.numTotalTests} tests, ` +
    `${j.numPassedTestSuites} suites, ${j.numFailedTests} failed). FR-B1/B2/B3 verified and sound. ` +
    'FAIL is scoped to FR-B4: scripts/ci/bypass-ledger-handoff-join-check.mjs is dead by construction — ' +
    'its Windows entrypoint guard never matches (exits 0 with ZERO output, a silent false green), and ' +
    'nothing in the repo invokes it (no workflow, no npm script, no gate).',
  findings: {
    fr_b1_bypass_ledger_join: 'PASS — threaded through bypass-stamp.js, both BaseExecutor bypass sites, cli-main.js, and both HandoffRecorder write sites. Covered by handoff-recorder-bypass-ledger-join.test.js + bypass-stamp.test.js extensions.',
    fr_b2_self_authored_refusal: 'PASS — refusal site verified live, not dead: process.env.CLAUDE_SESSION_ID is populated at runtime (confirmed 838c05dd-...). subagent-evidence-gate.js widened detail arrays carry session_id through to gateResults. Covered by base-executor-bypass-self-authored-refusal.test.js driving BaseExecutor.execute() with bypassValidation:true.',
    fr_b3_regression_tests: 'PASS — 39 tests across the 4 new/extended files, all green.',
    fr_b4_ci_census_script: 'FAIL — two compounding defects, both in the exact failure class this SD exists to close.',
  },
  warnings: [
    {
      severity: 'HIGH',
      issue:
        'FR-B4 defect 1 of 2 — silent false green on Windows. scripts/ci/bypass-ledger-handoff-join-check.mjs:118 guards main() with ' +
        '`import.meta.url === `file://${process.argv[1]}``. On Windows import.meta.url is `file:///C:/Users/...` (forward slashes, triple slash) ' +
        'while process.argv[1] is `C:\\Users\\...` (backslashes), so the comparison is ALWAYS false, main() never runs, and the script exits 0 ' +
        'emitting nothing. Verified by runtime probe, not inference. A census that reports nothing while exiting 0 is an instrument that lies.',
      recommendation: 'Use `import.meta.url === pathToFileURL(process.argv[1]).href` (import { pathToFileURL } from "node:url").',
    },
    {
      severity: 'HIGH',
      issue:
        'FR-B4 defect 2 of 2 — not wired into CI at all. `git grep` across all tracked files finds exactly ONE reference to the script: ' +
        'tests/unit/ci/bypass-ledger-handoff-join-check.test.js importing the pure classifier. No GitHub Actions workflow, no package.json ' +
        'script, and no gate invokes it. FR-B4 calls it a "CI census script" but it is not in CI.',
      recommendation: 'Wire it into .github/workflows/leo-bypass-validation.yml, which already runs the sibling scripts/ci/resolve-pr-bypass-sd.mjs.',
    },
    {
      severity: 'MEDIUM',
      issue:
        'Coverage gap that let defect 1 ship green: tests/unit/ci/bypass-ledger-handoff-join-check.test.js exercises ONLY the pure ' +
        'classifyBypassLedgerRows() function. The entrypoint guard, the Supabase census queries, and the bucket→exit-code mapping are untested.',
      recommendation: 'Add a child-process test asserting the script emits parseable JSON on stdout and exits non-zero when unjoined_defect > 0.',
    },
    {
      severity: 'LOW',
      issue: 'classifyBypassLedgerRows JSDoc references a passed-in `now` parameter that does not exist in the signature (doc drift, non-functional).',
      recommendation: 'Drop the `now` mention from the JSDoc.',
    },
  ],
  metadata: {
    phase: 'EXEC-TO-PLAN',
    sd_key: SD_KEY,
    commit_under_test: '8ae52108e809cf6680e19dbb05bd38295c0d668d',
    branch: 'feat/SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B',
    pr: 8219,
    test_execution: testExecution,
    suites: {
      total: j.numTotalTestSuites,
      passed: j.numPassedTestSuites,
      failed: j.numFailedTestSuites,
    },
    targeted_runs: [
      { scope: '4 new/extended files (FR-B3 + FR-B4 tests)', files: 4, tests_passed: 39, tests_failed: 0 },
      { scope: 'tests/unit/handoff/ + tests/unit/subagent-evidence-gate.test.js (blast radius)', files: 124, tests_passed: 1265, tests_skipped: 3, tests_failed: 0 },
      { scope: 'full unit suite (regression census)', files: j.numTotalTestSuites, tests_passed: j.numPassedTests, tests_failed: j.numFailedTests },
    ],
    regressions_detected: 0,
    fail_scope: 'FR-B4 only; FR-B1/B2/B3 pass with zero regressions',
    remediation_size: 'small — 2-line entrypoint guard fix + ~6-line workflow step + 1 child-process test',
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
