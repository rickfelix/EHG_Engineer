/**
 * TESTING sub-agent evidence writer for SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001 (EXEC-TO-PLAN).
 *
 * Why this exists alongside the canonical execute-subagent.js row (ed803f36): that run executed
 * from the MAIN repo root (branch main, HEAD 5a92ab66), a tree that does NOT contain
 * lib/coordinator/urgency-levels.cjs or tests/unit/coordinator/dispatch-urgency-stamp.test.js.
 * Its tests_passed:89/found_files:8 measurement is therefore of a tree lacking the change under
 * test. This row carries a measurement taken IN the worktree that actually holds the diff.
 */
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
import crypto from 'crypto';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const require = createRequire(import.meta.url);
const SD_UUID = '71fb0b59-adb5-4c65-88d3-5fe788b062d1';
const SD_KEY = 'SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001';

const artifactPath = '.artifacts/testing-crr001-targeted.json';
const raw = fs.readFileSync(artifactPath);
const targeted = JSON.parse(raw);
const artifactSha = crypto.createHash('sha256').update(raw).digest('hex');

const headSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();

const results = {
  verdict: 'PASS',
  confidence_score: 92,
  summary:
    'Backend-only Node.js diff (coordinator dispatch writer + shared urgency enum + doc/comment '
    + 'pointer fixes). Full unit suite and all coordinator/dispatch-adjacent suites green; the single '
    + 'full-suite failure is a load-dependent perf timeout with zero coupling to the diff. Playwright '
    + 'E2E determined NON-APPLICABLE (zero UI surface).',
  critical_issues: [],
  warnings: [
    {
      severity: 'LOW',
      issue:
        'Full-suite run had 1 failing test: tests/unit/eva/complexity-scorer.test.js > "should complete '
        + 'scan in under 30 seconds" (vitest timeout at 60008ms). Environmental, not a regression.',
      recommendation:
        'Proven environmental: the file passes in isolation in 8.64s (7/7), asserts only scan DURATION '
        + '(not content), and contains zero references to coordination-inbox.cjs / lib/coordinator/dispatch.cjs '
        + '/ urgency-levels.cjs / coordinator-adam-comms.md. It walks process.cwd() under 4200-file parallel load.',
    },
    {
      severity: 'MEDIUM',
      issue:
        'The canonical execute-subagent.js TESTING row (ed803f36-bf6f-4d47-861e-7406816648c6) measured the '
        + 'WRONG TREE: executed_from_cwd was the main repo root (branch main, HEAD 5a92ab66), which does not '
        + 'contain urgency-levels.cjs or dispatch-urgency-stamp.test.js. Its 89-test measurement did not '
        + 'exercise this SD\'s diff, and its evaluated_commit_sha (8f58ba13) is an unrelated QF merge commit.',
      recommendation:
        'Treat THIS row as the authoritative TESTING measurement for the EXEC-TO-PLAN handoff. Separately, '
        + 'execute-subagent.js should resolve the SD\'s active worktree (it already prints the correct branch '
        + 'context) rather than measuring whatever tree its cwd happens to be.',
    },
  ],
  recommendations: [
    'No blocking action. Proceed to PLAN verification.',
  ],
  metadata: {
    phase: 'EXEC-TO-PLAN',
    measured: true,
    measurement_tree: {
      branch,
      head_sha: headSha,
      working_tree: 'dirty (implementation uncommitted at measurement time, per EXEC handoff description)',
      changed_files: [
        'lib/coordinator/urgency-levels.cjs (NEW, 24 LOC)',
        'lib/coordinator/dispatch.cjs (MODIFIED)',
        'scripts/hooks/coordination-inbox.cjs (MODIFIED, comment-only)',
        'docs/protocol/coordinator-adam-comms.md (MODIFIED, docs-only)',
        'tests/unit/coordinator/dispatch-urgency-stamp.test.js (NEW, 181 LOC, 8 tests)',
      ],
    },
    diff_verification: {
      description_accurate: true,
      notes:
        'git diff confirms all 5 items. dispatchToWorker remains a thin wrapper — it spreads opts and only '
        + 'defaults targetRoleHint, so opts.urgency flows through unchanged. insertCoordinationRow destructures '
        + 'urgency=null and stamps row.payload.urgency only when non-null (byte-identical omission path). '
        + 'Validation is fail-open: unrecognized values warn via logger.warn but are still written.',
    },
    // Canonical shape (lib/sub-agents/testing/test-execution-record.js buildTestExecution).
    // Counts correspond EXACTLY to the hashed runner artifact named in artifact_path/artifact_sha.
    test_execution: buildTestExecution({
      executed: targeted.numTotalTests,
      passed: targeted.numPassedTests,
      failed: targeted.numFailedTests,
      skipped: targeted.numPendingTests,
      artifactSha: artifactSha,
      runner: 'vitest',
      artifactPath: artifactPath,
      source: 'vitest_json_reporter',
      foundFiles: targeted.numTotalTestSuites,
    }),
    full_suite_execution: {
      command: 'npm run test:unit (vitest run --project unit)',
      test_files_total: 4200,
      test_files_passed: 4184,
      test_files_failed: 1,
      test_files_skipped: 15,
      tests_total: 51853,
      tests_passed: 51640,
      tests_failed: 1,
      tests_expected_fail: 1,
      tests_skipped: 209,
      tests_todo: 2,
      duration_s: 225.1,
      failing_files: ['tests/unit/eva/complexity-scorer.test.js'],
      failure_class: 'environmental_perf_timeout',
    },
    targeted_suite_command:
      'npx vitest run --project unit tests/unit/coordinator/dispatch-urgency-stamp.test.js '
      + 'tests/unit/coordinator/ tests/unit/coordinator-dispatch-*.test.js tests/unit/dispatch-*.test.js '
      + 'tests/dispatch-eligibility-convergence.test.js tests/unit/coordination-inbox*.test.js '
      + 'tests/unit/sd/amend-sd*.test.js',
    new_test_file: {
      path: 'tests/unit/coordinator/dispatch-urgency-stamp.test.js',
      tests: 8,
      passed: 8,
      covers: ['TS-1 stamp', 'TS-2 byte-identical omission', 'TS-3 fail-open on unknown value', 'TS-4 enum guard', 'TS-5 writer-row -> real reader shape agreement'],
    },
    regression_check: {
      reported_baseline_failures_reproduced: false,
      note:
        'The EXEC-reported baseline of 10 failures across guard-wiring.test.js / no-bare-progress-column.test.js '
        + '/ canonical-corpus-invariant.test.js did NOT reproduce: those 3 files pass 99/99 in isolation here and '
        + 'passed inside the full-suite run. Both that baseline and this run\'s single failure are timeout-class, '
        + 'i.e. machine-load dependent, not diff dependent.',
      diff_coupled_failures: 0,
    },
    e2e_applicability: {
      applicable: false,
      determination: 'NON_APPLICABLE_BACKEND_ONLY',
      reasons: [
        'Zero UI surface in the diff: 0 files matching .tsx/.jsx/.vue/.svelte/.css/.scss. Changed set is 2 .cjs, 1 .js test, 1 .md.',
        'playwright.config.js testDir=./tests/e2e with baseURL=http://localhost:8080 — that is the EHG venture app UI, a DIFFERENT application from EHG_Engineer where this diff lives.',
        'playwright.config.js sets webServer: [] — no server is auto-started, so a run would exercise either a stale or absent app.',
        'grep over tests/e2e/ returns zero files referencing coordination-inbox, coordinator/dispatch, urgency-levels, or payload.urgency.',
        'The changed code path (session_coordination row writer + a Claude Code hook) has no browser reachability; it is invoked by CLI/hook processes only.',
        'Concordant with the earlier DESIGN sub-agent skip determination (backend_only_diff) and with the canonical TESTING run\'s independent applicability_rule=policy_non_applicable_code_measured / zero_ui_source=files_to_modify.',
      ],
      correct_evidence_class: 'unit_test_coverage_only',
      integration_tier_note:
        'npm run test:integration (vitest --project db) is the DB tier and executes zero tests in this environment, '
        + 'so it adds no signal for this diff either.',
      e2e_executed: false,
    },
    supersedes_row: {
      id: 'ed803f36-bf6f-4d47-861e-7406816648c6',
      reason: 'measured main repo root, a tree without the change under test',
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  fallback: process.cwd(),
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'TESTING',
  SD_UUID,
  { code: 'TESTING', name: 'QA Engineering Director' },
  results,
  { phase: 'EXEC-TO-PLAN', sdKey: SD_KEY }
);

console.log('\n=== STORED ===');
console.log(JSON.stringify(stored, null, 2).slice(0, 1200));
