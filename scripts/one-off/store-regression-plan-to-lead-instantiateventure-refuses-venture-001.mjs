// PLAN-TO-LEAD VERIFY-phase REGRESSION for SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001
// (PR #9013). Confirms the full unit tier and the directly-affected test area are clean after
// this VERIFY pass's own fix (2 real CI lint failures, both in this SD's scripts/one-off/ evidence
// scripts, resolved in commit c4d234ae936).
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '0667ff2f-c224-4359-92a7-d156a0a414b1';
const SD_KEY = 'SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001';

const detailedAnalysis = `PLAN-TO-LEAD VERIFY-phase REGRESSION for SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001
(PR #9013, commit c4d234ae936 -- the VERIFY-phase main-guard fix).

FULL UNIT TIER: npx vitest run --project unit -- 4254 test files, 52671 tests passed, 1 expected
fail, 209 skipped, 2 todo (52883 total), 0 unexpected failures. Duration 292.25s. Ran AFTER pushing
this VERIFY pass's own fix commit (5 scripts/one-off/ files gaining a main-guard), confirming that
fix introduced zero regressions of its own across the entire unit tier -- not just the directly-
affected area.

TARGETED RE-RUN (directly-affected area, run standalone before the full-tier run):
npx vitest run tests/unit/venture-ceo-factory.test.js tests/unit/agents/ -- 217/217 passed across
11 test files in 2.51s. This matches the count independently reproduced by EXEC-TO-PLAN TESTING
(sub_agent_execution_results id df505bc7: 22/22 for the changed test file + 195/195 across
tests/unit/agents/), confirming stability of that count across 2 independent runs at different
points in the VERIFY timeline (once before the main-guard fix commit, once after).

PRE-COMMIT HOOK REGRESSION SURFACE: the main-guard fix commit (c4d234ae936) itself passed the full
local pre-commit gate chain (branch guard, CLAUDE*.md protection, secret detection, artifact-
persistence enforcement, DB-test guard, ESLint auto-fix, smoke tests, DOCMON, Gate 0 SD-status
validation, scope gate, LOC-threshold check [+31/-17, 48 total, below SD threshold], root-temp-file
check, CLAUDE_*.md drift check) with zero manual bypass or --no-verify.

CI REGRESSION SURFACE: gh pr checks 9013 after the fix push shows every required check green,
including "Run Unit Tier (quarantine-aware)" and "coverage" (both were PENDING on the pre-fix
snapshot and reached a final PASS state on re-poll, not left as a stale pending read), plus all
~55 other lint/gate/compliance checks (schema-reference-lint, ismainmodule-classguard-lint,
no-mocked-sut-import-lint, session-coordination-insert-classguard-lint, etc.) unaffected by this
SD's scope.

VERDICT: Zero regressions from this SD's implementation (lib/agents/venture-ceo-factory.js,
tests/unit/venture-ceo-factory.test.js) or from this VERIFY pass's own fix commit (5 scripts/one-off/
evidence scripts gaining a main-guard). Full unit tier and the directly-affected area both clean.`;

const results = {
  verdict: 'PASS',
  confidence: 95,
  summary:
    'PLAN-TO-LEAD VERIFY REGRESSION for SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001 (PR #9013). Full unit tier (npx vitest run --project unit): 4254 test files, 52671 tests passed, 0 unexpected failures (1 pre-existing expected-fail, 209 skipped, 2 todo, none introduced by this branch). Targeted re-run of tests/unit/venture-ceo-factory.test.js + tests/unit/agents/: 217/217 passed, matching EXEC-TO-PLAN TESTING\'s independently-reproduced count. This VERIFY pass\'s own fix commit (c4d234ae936, adding main-guards to 5 scripts/one-off/ evidence scripts to resolve 2 real CI failures) introduced zero regressions across the full tier. CI fully green on re-poll, including the 2 checks (Run Unit Tier, coverage) that were still pending on the initial snapshot.',
  detailed_analysis: detailedAnalysis,
  warnings: [],
  metadata: {
    measured: true,
    test_execution: buildTestExecution({
      executed: 52883,
      passed: 52671,
      failed: 0,
      skipped: 209,
      runner: 'vitest@4.1.4',
      source: 'npx vitest run --project unit (full unit tier, run after the VERIFY-phase main-guard fix commit c4d234ae936) + npx vitest run tests/unit/venture-ceo-factory.test.js tests/unit/agents/ (217/217, targeted re-run of the directly-affected area).',
    }),
    full_tier_expected_fail: 1,
    full_tier_todo: 2,
    targeted_tests: 217,
    targeted_test_files: 11,
    fix_commit: 'c4d234ae936',
    pr_number: 9013,
  },
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD_ID,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'REGRESSION',
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults('REGRESSION', SD_ID, { code: 'REGRESSION', name: 'Regression' }, results, {
    sdKey: SD_KEY,
    phase: 'PLAN-TO-LEAD',
  });

  console.log('Stored REGRESSION sub-agent results:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict }, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('FAILED to store REGRESSION results:', err);
    process.exit(1);
  });
}
