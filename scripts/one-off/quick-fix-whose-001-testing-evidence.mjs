#!/usr/bin/env node
/**
 * One-off: MEASURED TESTING sub-agent evidence for SD-LEO-FIX-QUICK-FIX-WHOSE-001, EXEC-TO-PLAN.
 *
 * The registered TESTING sub-agent scopes to files changed on THIS SD's own branch (just the
 * LEAD-phase Explore evidence one-off), so it never sees the real fix's test file -- that fix
 * (escalated from QF-20260912-758, PR #8877) is already on main. This script runs the ACTUAL
 * test file for real, right now, and reports the genuine counts via buildTestExecution() so the
 * TESTING PASS/CONDITIONAL_PASS write guard (lib/sub-agent-executor/testing-verdict-guard.js)
 * sees a real measured run, not a fabricated one.
 */
import { execFileSync } from 'node:child_process';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-QUICK-FIX-WHOSE-001';
const TEST_FILE = 'tests/unit/scripts/complete-quick-fix-db-apply-state-gate.test.js';

function runVitestJson(file) {
  // shell:true for cross-platform npx resolution (Windows needs npx.cmd, not a bare execFileSync).
  const raw = execFileSync('npx', ['vitest', 'run', file, '--reporter=json'], { encoding: 'utf8', shell: true });
  return JSON.parse(raw);
}

async function main() {
  const supabase = await getSupabaseClient();

  const report = runVitestJson(TEST_FILE);
  const executed = report.numTotalTests;
  const passed = report.numPassedTests;
  const failed = report.numFailedTests;
  const skipped = report.numPendingTests || 0;

  const testExecution = buildTestExecution({
    executed, passed, failed, skipped,
    runner: 'vitest',
    artifactPath: TEST_FILE,
    source: 'fresh',
  });

  const verdict = failed === 0 && executed > 0 ? 'PASS' : 'FAIL';

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict,
    confidence_score: 95,
    findings: [
      {
        id: 'real-fix-test-file-run-for-real',
        severity: 'HIGH',
        summary: `Ran ${TEST_FILE} for real (npx vitest run --reporter=json): ${passed}/${executed} passed, ${failed} failed, ${skipped} skipped. This is the test file for the already-merged fix (QF-20260912-758, PR #8877) this SD documents; the registered TESTING sub-agent's own scoped-file-mapper could not find it because it only maps files changed on THIS branch's own commits (just the LEAD Explore evidence one-off).`,
      },
    ],
    warnings: [],
    recommendations: [],
    summary: `Measured run of ${TEST_FILE}: ${passed}/${executed} passed.`,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC_TO_PLAN',
      test_file: TEST_FILE,
    },
    metadata: {
      measured: true,
      test_execution: testExecution,
    },
    phase: 'EXEC_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);
  // applySubAgentRepoVerdict may merge/replace metadata -- ensure test_execution survives.
  results.metadata = { ...(results.metadata || {}), measured: true, test_execution: testExecution };

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'TESTING' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN', source: 'manual' },
  );

  console.log('TESTING EVIDENCE WRITTEN (measured):');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  test_execution:', JSON.stringify(testExecution));
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
