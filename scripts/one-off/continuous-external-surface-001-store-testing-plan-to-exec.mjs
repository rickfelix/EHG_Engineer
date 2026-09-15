#!/usr/bin/env node
// PLAN-TO-EXEC TESTING evidence for SD-LEO-INFRA-CONTINUOUS-EXTERNAL-SURFACE-001.
// Describes the verification STRATEGY for the not-yet-built checker (EXEC has not started).
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CONTINUOUS-EXTERNAL-SURFACE-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 80,
    phase: 'PLAN-TO-EXEC',
    execution_time_ms: 0,
    summary: "PLAN-phase TESTING STRATEGY (EXEC has not started; no test-run numbers exist yet -- this evidence describes HOW each of the PRD's 5 test scenarios (TS-1..TS-5) will be verified during EXEC, not fabricated results). TS-1 (migration-apply-time block): seed a TIER-1-eligible fixture migration in a disposable schema/table via the wired pending-migrations-check.js hook, assert the post-apply checker call returns a block/flag verdict, not a silent pass -- run via the existing pending-migrations-check.js test harness pattern (vitest, direct pg fixtures). TS-2 (3-verdict canary distinctness): unit-test the checker module directly with 3 injected client configs (invalid anon key, a mock client whose query always throws/times out, a genuine working anon client against a disposable fixture schema) and assert 3 distinct verdict shapes -- no shared-result collapse. TS-3 (allowlist zero-write): grep this SD's own diff (git diff against origin/main) for any INSERT/write statement targeting public_read_allowlist -- CI-enforceable via a dedicated lint/test asserting the string absence in EXEC's own file set, plus a live post-EXEC query confirming 0 rows. TS-4 (coverage-report accuracy): unit test with a 4-table fixture (2 allowlisted, 1 simulated-unreachable via a forced connection error, 1 genuinely exposed) asserting exact count fields in the checker's coverage-report output. TS-5 (semantic-shape classifier): unit test FR-7's classifier with 2 fixtures -- an unconventionally-named field carrying an explicit approved_at timestamp (must classify as approved) and a differently-shaped hold/fence object with no approval verdict field (must classify as not-approved) -- proving shape-based, not name-based, classification. Each new test will be MUTATION-TESTED per this session's standing evidence discipline: mutate the implementation to break the invariant, confirm the specific test fails, restore, confirm clean pass -- before being counted as non-vacuous.",
    critical_issues: [],
    warnings: [
      "EXEC has not started -- this is a STRATEGY, not test-run evidence. The EXEC-TO-PLAN TESTING evidence (post-implementation) will carry actual runner-produced pass/fail counts.",
    ],
    recommendations: [
      "Build TS-1's fixture migration against a scratch/disposable table name (never a real production table) to avoid any risk during the seeded-migration test.",
      "TS-2's dead-connection injection should use a mock/stub client, not an actual network timeout, to keep the test suite fast and deterministic.",
    ],
    detailed_analysis: {
      commands_run: [
        'Read PRD functional_requirements FR-1..FR-7 and test_scenarios TS-1..TS-5 from continuous-external-surface-001-prd-content.json',
        'Cross-referenced each TS against the existing pending-migrations-check.js test harness pattern and audit-security-linter.mjs module structure for a consistent EXEC-phase test authoring approach',
      ],
    },
    metadata: {
      independent_verification: true,
      plan_phase_strategy_only: true,
      measured: false,
      test_execution: buildTestExecution({ source: 'reused', runner: 'plan-phase-strategy-not-yet-executed' }),
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    probeExistsRelative: 'scripts/one-off/continuous-external-surface-001-store-testing-plan-to-exec.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'TESTING' }, results, { sdKey: SD_KEY, phase: 'PLAN-TO-EXEC' });
  console.log('STORED:', 'TESTING', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
