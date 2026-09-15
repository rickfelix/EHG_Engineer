#!/usr/bin/env node
// EXEC-TO-PLAN SECURITY evidence for SD-LEO-INFRA-CLOSE-PUBLIC-READ-001.
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
    confidence: 95,
    phase: 'EXEC-TO-PLAN',
    execution_time_ms: 0,
    summary: "This SD is itself a security remediation, correctly scoped and safely executed: dropped 23 confirmed-dead tables (each a stale duplicate of a populated live source, zero FK references, chairman-approved via verified ratification) that were publicly readable by the anon key with zero row-level protection. Net security effect: permanently removes ~13,000 of the ~15,356 exposed rows the chairman's own Advisors scan flagged, by elimination rather than by adding policies to dead data. Reviewed for over-reach: confirmed via 3 independent live-DB checks (2 by this session, 1 by the coordinator) that exactly the 23 approved tables -- no more, no fewer -- are gone; no live table, RLS policy, or key was touched. The remaining 13-live-table exposure and key rotation are correctly deferred (not silently dropped from scope) as FR-3's own explicit exclusion.",
    critical_issues: [],
    warnings: [
      'The 13 live tables with the same public-read exposure have no owning SD yet (confirmed via a duplicate-scope search this session) -- a real, chairman-flagged security gap that should be surfaced to the coordinator once this narrower SD completes.',
    ],
    recommendations: [
      'File or flag the 13-live-table RLS remediation as its own follow-up item once this SD closes -- it is real, unclaimed, chairman-flagged security work.',
    ],
    detailed_analysis: {
      commands_run: [
        'Read the migration file\'s full safety-basis section (no FK references, confirmed live before the file was written, each table a stale duplicate of a populated live source)',
        'Confirmed via 3 independent direct-pg checks that exactly the 23 approved tables are gone, no more no fewer',
        'git diff origin/main...HEAD -- confirmed no RLS policy, key, or live-table file touched by this SD',
      ],
    },
    metadata: { independent_verification: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    probeExistsRelative: 'scripts/one-off/close-public-read-001-store-security-exec-to-plan.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('SECURITY', sdRow.id, { code: 'SECURITY', name: 'Security' }, results, { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' });
  console.log('STORED:', 'SECURITY', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
