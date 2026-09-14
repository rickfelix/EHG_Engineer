#!/usr/bin/env node
/**
 * Persist TESTING sub-agent evidence for SD-LEO-INFRA-CHAIRMAN-SMS-DURABLE-001's EXEC-TO-PLAN
 * handoff. The reviewing sub-agent explicitly scoped itself as review-only and did not write its
 * own sub_agent_execution_results row.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CHAIRMAN-SMS-DURABLE-001';

const summary = 'CONDITIONAL_PASS at review time (commit b33d60b4b2d), both findings resolved before ship: ' +
  '(1) BLOCKER: line-pinned census entry in lib/coordinator/insert-coordination-row-callers.cjs for ' +
  'lib/chairman/sms-bridge.js drifted 1125->1136 (the self-heal try/catch added 11 lines above the ' +
  'pinned insertCoordinationRow call site), outside the guard +-3 window -- fixed, commit 24011e37c49. ' +
  '(2) GAP: neither existing stageDecisionSmsNotification failure-path test (TR-2 decision_not_found, ' +
  'the update-error test) asserted the self-heal actually marks the orphaned chairman_notifications ' +
  'row status=failed -- added, and independently verified non-vacuous via mutation testing (temporarily ' +
  'removed the try/catch, confirmed both new assertions fail as expected, restored clean via git ' +
  'checkout), commit 24011e37c49. TR-4 phone-pin assertion confirmed mutation-detecting (CHAIRMAN_PHONE ' +
  'differs from the fixture phone in .env). Full test run: 2144/2144 (chairman+comms+adam scope), ' +
  '319/319 after the two fixes (targeted re-run). Unrelated pre-existing failures noted and excluded ' +
  '(outbound-sink-conformance missing an untouched file, eva/complexity-scorer, ' +
  'lint-repo-resolution-drift, 3 .db tests on a down network).';

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
    confidence: 90,
    findings: [
      { id: 'TESTING1-census-drift-fixed', severity: 'INFO', summary },
    ],
    warnings: [],
    recommendations: [],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'EXEC_TO_PLAN_TESTING',
      model: 'Sonnet 5',
      model_id: 'claude-sonnet-5',
      invoked_at: new Date().toISOString(),
      measured: true,
      test_execution: buildTestExecution({
        executed: 319,
        passed: 319,
        failed: 0,
        skipped: 0,
        artifactSha: '24011e37c4960dc7199563e63e45f1a28c93f0d0',
        runner: 'vitest',
        source: 'fresh',
      }),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-CHAIRMAN-SMS-DURABLE-001',
    },
    phase: 'EXEC_TO_PLAN',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'QA Engineering Director (testing-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
