#!/usr/bin/env node
// PLAN-TO-EXEC TESTING evidence (no code yet -- PLAN-phase testing STRATEGY row).
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-018';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 85,
    phase: 'PLAN-TO-EXEC',
    execution_time_ms: 0,
    summary: 'PLAN-phase testing strategy for the 3 PRD test scenarios (TS-1/TS-2/TS-3). No code exists yet (this is a pre-EXEC planning row). Strategy: TS-1 asserts the doc\'s example story_key/priority values, once written, satisfy the LIVE database/schema-reference-snapshot.json constraint definitions (regex test + enum membership) -- read from the live snapshot at test-run time, never hardcoded, so a future constraint change that the doc forgets to follow fails the test instead of silently drifting stale. TS-2/TS-3 assert the extended cli-main.js checklist hint text (once added) contains the string \'priority\' and a story_key format reference consistent with the live regex. All 3 will live in a new tests/unit/docs/ or tests/unit/handoff/ test file, run via vitest, matching this repo\'s established pattern for doc-vs-schema drift tests (e.g. schema-reference-snapshot.test.js precedent).',
    critical_issues: [],
    warnings: [],
    recommendations: [
      'EXEC should write the new test file BEFORE or alongside the doc/hint changes (TDD-adjacent), then run mutation testing on each new test to prove non-vacuousness, matching this session\'s established discipline.',
    ],
    detailed_analysis: {
      commands_run: [
        'Read database/schema-reference-snapshot.json directly to confirm the exact constraint text this PLAN-phase strategy will assert against',
      ],
    },
    metadata: {
      independent_verification: true,
      measured: false,
      test_execution: buildTestExecution({
        executed: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        runner: 'vitest',
        source: 'PLAN-phase strategy only -- no code/tests exist yet',
      }),
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    probeExistsRelative: 'scripts/one-off/pat-les-018-store-testing-plan-to-exec.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'Testing' }, results, { sdKey: SD_KEY, phase: 'PLAN-TO-EXEC' });
  console.log('STORED:', 'TESTING', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
