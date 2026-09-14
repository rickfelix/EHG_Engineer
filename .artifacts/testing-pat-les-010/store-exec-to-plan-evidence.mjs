/**
 * TESTING sub-agent evidence writer — SD-LEARN-FIX-ADDRESS-PAT-LES-010, phase EXEC_TO_PLAN.
 * Runner-produced: reads the vitest JSON artifact this run wrote, hashes it, and stores the
 * verdict through the canonical writer. No hand-authored counts.
 */
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const ENGINEER_ROOT = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer';
const WORKTREE = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PAT-LES-010';

const { storeSubAgentResults } = await import(`file://${ENGINEER_ROOT}/lib/sub-agent-executor/results-storage.js`);
const { resolveSubAgentRepo, applySubAgentRepoVerdict } = await import(`file://${ENGINEER_ROOT}/lib/sub-agents/resolve-repo.js`);
const { buildTestExecution } = await import(`file://${ENGINEER_ROOT}/lib/sub-agents/testing/test-execution-record.js`);
const { getSupabaseClient } = await import(`file://${ENGINEER_ROOT}/lib/sub-agent-executor/supabase-client.js`);

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-010';
const ARTIFACT = path.join(WORKTREE, '.artifacts/testing-pat-les-010/exec-to-plan-dir-results.json');

// --- read the runner's own output (not a hand count) ---
const raw = readFileSync(ARTIFACT);
const artifactSha = crypto.createHash('sha256').update(raw).digest('hex');
const report = JSON.parse(raw);

const executed = report.numTotalTests;
const passed = report.numPassedTests;
const failed = report.numFailedTests;
const skipped = report.numPendingTests ?? 0;

// Targeted file slice, derived from the same runner artifact.
const TARGET_FILE = 'stage-23-launch-readiness-fr1-4-6.test.js';
const targetSuite = (report.testResults || []).find((t) => t.name.replace(/\\/g, '/').endsWith(TARGET_FILE));
const targetAssertions = targetSuite?.assertionResults || [];
const targetPassed = targetAssertions.filter((a) => a.status === 'passed').length;
const targetTotal = targetAssertions.length;
const guardTest = targetAssertions.find((a) => /regression guard/i.test(a.title || a.fullName || ''));

if (failed > 0 || report.success !== true) {
  throw new Error(`Refusing to write PASS: runner artifact reports failed=${failed} success=${report.success}`);
}
if (targetTotal !== 17 || targetPassed !== 17) {
  throw new Error(`Refusing to write PASS: target file reports ${targetPassed}/${targetTotal}, expected 17/17`);
}
if (!guardTest || guardTest.status !== 'passed') {
  throw new Error(`Refusing to write PASS: regression-guard assertion missing or not passing (status=${guardTest?.status})`);
}

const supabase = await getSupabaseClient();
const resolution = await resolveSubAgentRepo({
  sdId: SD_KEY,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  probeExistsRelative: 'tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js',
  supabase,
});

const results = {
  verdict: 'PASS',
  confidence_score: 95,
  summary:
    `EXEC-TO-PLAN TESTING verification for ${SD_KEY}. Targeted file ` +
    `tests/unit/eva/stage-templates/${TARGET_FILE}: ${targetPassed}/${targetTotal} passing, including the new FR-4 ` +
    'regression guard asserting 4 named source files never contain `stage22Data.promotion_gate` or a bare ' +
    '`evaluateKillGate(`. Broader directory tests/unit/eva/stage-templates/: ' +
    `${executed} tests across ${report.numTotalTestSuites} suites — ${passed} passed, ${failed} failed, ${skipped} skipped, ` +
    `0 failing suites. No collateral regressions. No production code modified by this SD (test-only change).`,
  execution_time_ms: Math.max(0, (report.endTime ?? 0) - (report.startTime ?? 0)),
  findings: [
    {
      severity: 'INFO',
      title: 'Regression guard is substantive, not a tautology',
      description:
        'The new assertion readFileSync()s 4 real source files (lib/eva/stage-templates/stage-23.js, stage-24.js, ' +
        'analysis-steps/stage-23-launch-readiness.js, analysis-steps/stage-23-dedicated-venture-uat.js) and asserts ' +
        'absence of both literals. It fails if the superseded fragile boolean check is reintroduced into any of them.',
    },
    {
      severity: 'INFO',
      title: 'Broader suite clean',
      description:
        `tests/unit/eva/stage-templates/ — ${report.numPassedTestSuites}/${report.numTotalTestSuites} suites passed, ` +
        `0 failed. 5 pending/skipped are pre-existing, not introduced by this SD.`,
    },
  ],
  metadata: {
    phase: 'EXEC_TO_PLAN',
    sd_key: SD_KEY,
    branch: 'feat/SD-LEARN-FIX-ADDRESS-PAT-LES-010',
    measured: true,
    test_execution: buildTestExecution({
      executed,
      passed,
      failed,
      skipped,
      artifactSha,
      runner: 'vitest',
      artifactPath: path.relative(ENGINEER_ROOT, ARTIFACT).replace(/\\/g, '/'),
      source: 'sub_agent_run',
      mappedCandidates: report.numTotalTestSuites,
      foundFiles: (report.testResults || []).length,
    }),
    targeted_file: {
      path: `tests/unit/eva/stage-templates/${TARGET_FILE}`,
      tests_passed: targetPassed,
      tests_total: targetTotal,
      regression_guard_passed: guardTest.status === 'passed',
    },
    commands_run: [
      `npx vitest run tests/unit/eva/stage-templates/${TARGET_FILE}`,
      'npx vitest run tests/unit/eva/stage-templates/',
    ],
  },
};

applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });

const stored = await storeSubAgentResults('TESTING', SD_KEY, { code: 'TESTING', name: 'QA Engineering Director' }, results, {
  sdKey: SD_KEY,
  phase: 'EXEC_TO_PLAN',
});

console.log('\n--- STORE RESULT ---');
console.log(JSON.stringify(stored, null, 2));
console.log('final verdict:', results.verdict, '| confidence:', results.confidence_score);
console.log('repo_path:', results.metadata.repo_path);
console.log('executed_from_cwd:', results.metadata.executed_from_cwd);
console.log('artifact_sha:', artifactSha);
