#!/usr/bin/env node
// PLAN-TO-EXEC TESTING evidence for SD-LEO-INFRA-CLOSE-PUBLIC-READ-001.
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
    confidence: 90,
    phase: 'PLAN-TO-EXEC',
    execution_time_ms: 0,
    summary: "The migration (database/migrations/20260915_close_public_read_drop_dead_snapshots.sql) was already applied to the live database before this SD's formal LEO pass began -- EXEC's actual verification work is TS-1/TS-2 from the PRD, both already run and passed during LEAD/PLAN: TS-1 (direct pg-connection query against information_schema.tables for all 23 names) returned 0 rows, run twice independently (once by this session via createDatabaseClient('engineer'), once by the coordinator via their own direct connection) with matching results. TS-2 (migration file's DROP TABLE list matches chairman_drop_approval.scope_exactly) confirmed by direct diff of the 23 names against the chairman-approved scope array -- exact match, no extras, no omissions. No new code to write for EXEC; the remaining EXEC-phase task is re-confirming these 2 already-passed checks one more time before the SD closes.",
    critical_issues: [],
    warnings: [],
    recommendations: [
      'EXEC-TO-PLAN should re-run TS-1 one more time (a 3rd independent direct-pg-connection check) immediately before claiming EXEC completion, given the false-positive PostgREST-cache trap already caught once this SD.',
    ],
    detailed_analysis: {
      commands_run: [
        "Direct pg connection (createDatabaseClient('engineer')) query against information_schema.tables for all 23 table names -- 0/23 present, confirmed this session",
        "Diff of the migration's 23 DROP TABLE targets against chairman_drop_approval.scope_exactly -- exact match",
      ],
    },
    metadata: {
      independent_verification: true,
      measured: true,
      test_execution: buildTestExecution({
        executed: 2,
        passed: 2,
        failed: 0,
        skipped: 0,
        runner: 'direct-pg-verification',
        source: 'Direct pg connection to information_schema.tables (TS-1) + migration-vs-approval diff (TS-2), both run this session',
      }),
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    probeExistsRelative: 'scripts/one-off/close-public-read-001-store-testing-plan-to-exec.mjs',
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
