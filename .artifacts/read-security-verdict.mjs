import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
import { normalizeSDId } from '../scripts/modules/sd-id-normalizer.js';
const supabase = await getSupabaseClient();
const SD='SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E';
const uuid = await normalizeSDId(supabase, SD);
console.log('SD key:', SD);
console.log('SD uuid:', uuid);
if(!uuid){ console.error('could not resolve uuid'); process.exit(1); }
const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .select('id,sub_agent_code,phase,verdict,confidence,validation_mode,created_at,metadata,summary')
  .eq('sd_id', uuid)
  .order('created_at', { ascending: false })
  .limit(50);
if (error) { console.error('ERR', error.message); process.exit(1); }
console.log('ROWS:', data.length);
for (const r of data) {
  console.log('---', r.sub_agent_code, '|', r.phase, '|', r.verdict, '| conf', r.confidence,
    '|', r.validation_mode, '|', r.created_at);
  console.log('   id:', r.id);
  console.log('   repo_path:', r.metadata?.repo_path);
  console.log('   cwd:', r.metadata?.executed_from_cwd);
  console.log('   recorded_by:', r.metadata?.recorded_by);
  console.log('   summary:', String(r.summary||'').slice(0,300));
}
