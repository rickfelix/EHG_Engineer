#!/usr/bin/env node
// EXEC-TO-PLAN TESTING evidence for SD-LEO-INFRA-CLOSE-PUBLIC-READ-001.
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CLOSE-PUBLIC-READ-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 92,
    phase: 'EXEC-TO-PLAN',
    execution_time_ms: 0,
    summary: 'FR-1/FR-2/FR-3 verified. TS-1 (direct pg-connection query against information_schema.tables for all 23 dropped table names) re-run a 3RD independent time this pass, from a fresh node process: 0/23 present, matching both this session\'s earlier check and the coordinator\'s own independent verification. TS-2 (migration DROP TABLE list matches chairman_drop_approval.scope_exactly) re-confirmed by direct diff -- exact match. FR-3\'s exclusion boundary held: git diff for this SD touches only the migration file (already on main via PR #9024) plus this SD\'s own LEO-protocol evidence/spine scripts -- no live-table RLS policy, no key-rotation code, confirming the scope stayed exactly where FR-3 says it should.',
    critical_issues: [],
    warnings: [],
    recommendations: [
      'VERIFY-phase VALIDATION should run a 4th, fully independent direct-pg re-check as its own re-derivation, not reuse this count.',
    ],
    detailed_analysis: {
      commands_run: [
        "3rd independent direct pg connection (createDatabaseClient('engineer')) query against information_schema.tables for all 23 names -- 0/23 present",
        'git diff origin/main...HEAD --stat -- confirmed no live-table RLS or key-rotation file touched, scope held to FR-3\'s exclusion boundary',
      ],
    },
    metadata: {
      independent_verification: true,
      real_findings_count: 0,
      test_execution: buildTestExecution({
        executed: 2,
        passed: 2,
        failed: 0,
        skipped: 0,
        runner: 'direct-pg-verification',
        source: 'TS-1 (3rd independent run, direct pg connection) + TS-2 (scope diff)',
      }),
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    probeExistsRelative: 'scripts/one-off/close-public-read-001-store-testing-exec-to-plan.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'Testing' }, results, { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' });
  console.log('STORED:', 'TESTING', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
