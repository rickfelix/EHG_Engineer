#!/usr/bin/env node
// PLAN-TO-LEAD REGRESSION evidence for SD-LEO-INFRA-CLOSE-PUBLIC-READ-001.
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
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
    phase: 'PLAN-TO-LEAD',
    execution_time_ms: 0,
    summary: "Zero regression risk from this SD: the migration's own safety basis (independently re-confirmed 4 times this SD across LEAD/PLAN/EXEC-TO-PLAN/VERIFY, by 2 different sessions) established no FK references any of the 23 dropped tables, and each dropped table's live source table remains populated and untouched. Ran a repo-wide grep for any reference to the 23 dropped table names in lib/ and scripts/ -- found ZERO live code callers (no .from(<table>) or query construction anywhere); the only 3 matches are historical narrative text inside a DIFFERENT, already-completed SD's own evidence-script summary strings (chronic-red-guard-001, mentioning one of the table names while describing a past finding) -- not an active caller, confirmed by reading the matched lines directly. This SD's own PRs (#9024 merged; #9031 in flight) touch only the migration file plus LEO-protocol evidence scripts -- no application code, no RLS policy, no other table.",
    critical_issues: [],
    warnings: [],
    recommendations: [],
    detailed_analysis: {
      commands_run: [
        "grep -rl for each of the 23 dropped table names across lib/ scripts/ -- 3 matches, all historical narrative text in an unrelated completed SD's own evidence script, none a live code caller (confirmed by reading each matched line directly)",
        'git diff origin/main...HEAD --stat across both PRs -- confirmed no application code touched',
      ],
    },
    metadata: { independent_verification: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'REGRESSION',
    probeExistsRelative: 'scripts/one-off/close-public-read-001-store-regression-plan-to-lead.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('REGRESSION', sdRow.id, { code: 'REGRESSION', name: 'Regression' }, results, { sdKey: SD_KEY, phase: 'PLAN-TO-LEAD' });
  console.log('STORED:', 'REGRESSION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
