import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
const supabase = await getSupabaseClient();
const { data } = await supabase.from('sub_agent_execution_results').select('*')
  .eq('id','546969e8-d2ba-4a15-8497-78e992a55890').maybeSingle();
const m = data.metadata || {};
console.log('metadata TOP-LEVEL KEYS:', Object.keys(m).join(', '));
console.log('metadata.repo_path        =', m.repo_path);
console.log('metadata.executed_from_cwd=', m.executed_from_cwd);
console.log('col executed_from_cwd     =', data.executed_from_cwd);
console.log('metadata.recorded_by      =', m.recorded_by);
console.log('metadata.commit_sha       =', m.commit_sha);
console.log('metadata.diff_range       =', m.diff_range);
console.log('metadata.content_hash     =', m.content_hash);
console.log('source                    =', data.source);
console.log('invocation_id             =', data.invocation_id);
console.log('\n== repo compliance view ==');
const { data: v, error: ve } = await supabase.from('v_sub_agent_repo_compliance').select('*')
  .eq('id','546969e8-d2ba-4a15-8497-78e992a55890');
if (ve) console.log('view err:', ve.message); else console.log(JSON.stringify(v,null,2));
