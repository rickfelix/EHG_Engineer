import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 88,
  phase: 'LEAD',
  summary: 'Breadth search: no call site in this repo reads/branches on claim_sd\'s evicted_sd_key field (it has always been NULL, so nothing could have depended on a truthy value) -- the fix is purely additive from the caller\'s perspective. No other migration in database/migrations/ or database/chairman-gated/ reproduces the same SET-col-then-RETURNING-same-col anti-pattern; two near-matches (20251211_agent_task_contracts.sql, 20260704b_marketlens_instance_slot_rpcs.sql) are legitimate SET col = col +/- 1 ... RETURNING col patterns that correctly return the computed new value.',
  critical_issues: [],
  warnings: [],
  recommendations: [],
  detailed_analysis: {
    evicted_sd_key_callers: 'none found in scripts/, lib/, tests/ -- only appears in SQL artifact snapshots',
    same_antipattern_elsewhere: 'not found; all historical claim_sd migrations reproduce the same bug (now fixed), no other function does',
  },
  metadata: {
    breadth_search: true,
    exhaustive: false,
  },
  execution_time_ms: 0,
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'EXPLORE',
  probeExistsRelative: 'database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('EXPLORE', sdRow.id, { code: 'EXPLORE', name: 'Explore' }, results, {
  sdKey: SD_KEY,
  phase: 'LEAD',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
