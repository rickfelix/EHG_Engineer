import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results').select('id,sub_agent_code,verdict,phase,confidence_score,created_at,metadata').eq('sd_id','4520716b-0603-46b5-bf7e-19fe4271fe3b').order('created_at');
for (const r of data||[]) {
  console.log(`${r.created_at} | ${r.sub_agent_code} | ${r.verdict} | phase=${r.phase} | conf=${r.confidence_score} | id=${r.id}`);
  console.log(`   repo_path=${JSON.stringify(r.metadata?.repo_path)} repo_resolved=${r.metadata?.repo_resolved} registry_source=${r.metadata?.registry_source} skip_reason=${JSON.stringify(r.metadata?.skip_reason)}`);
}
const { data: sd } = await sb.from('strategic_directives_v2').select('target_application').eq('id','4520716b-0603-46b5-bf7e-19fe4271fe3b').maybeSingle();
console.log('\nSD target_application =', JSON.stringify(sd?.target_application));
