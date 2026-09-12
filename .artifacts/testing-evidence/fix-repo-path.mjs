import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const ROW_ID = '77f22659-f6c8-488c-91a2-7537d6fad0fe';
const SD_ID = 'dfdad20c-bf37-47ef-8588-0ebd82cfb874';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: existing, error: readErr } = await supabase
  .from('sub_agent_execution_results').select('metadata, verdict').eq('id', ROW_ID).single();
if (readErr) { console.error('READ FAILED:', readErr.message); process.exit(1); }

// Re-resolve WITH targetApplication (TESTING supports_cross_repo=true, so it is required).
const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  supabase,
});
console.log('resolution =', JSON.stringify(resolution));

const results = { verdict: existing.verdict, metadata: existing.metadata };
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: true });

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .update({ metadata: results.metadata })
  .eq('id', ROW_ID)
  .select('id, verdict, phase, created_at')
  .single();
if (error) { console.error('UPDATE FAILED:', error.message); process.exit(1); }

console.log('ROW UPDATED:', JSON.stringify(data, null, 2));
console.log('metadata.repo_path         =', results.metadata.repo_path);
console.log('metadata.repo_resolved     =', results.metadata.repo_resolved);
console.log('metadata.registry_source   =', results.metadata.registry_source);
console.log('metadata.executed_from_cwd =', results.metadata.executed_from_cwd);
