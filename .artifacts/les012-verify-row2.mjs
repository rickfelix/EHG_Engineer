import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const sb = createSupabaseServiceClient();
const { data } = await sb.from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, confidence, created_at, metadata, conditions, justification')
  .eq('sd_id','SD-LEARN-FIX-ADDRESS-PAT-LES-012').eq('sub_agent_code','TESTING').eq('phase','EXEC_TO_PLAN')
  .order('created_at',{ascending:false});
for (const r of data||[]) {
  console.log(`${r.created_at} | ${r.verdict} | conf ${r.confidence} | ${r.id}`);
  console.log('   repo_path:', r.metadata?.repo_path);
  console.log('   test_execution:', JSON.stringify(r.metadata?.test_execution));
  console.log('   conditions:', (r.conditions||[]).length, '| justification len:', (r.justification||'').length);
}
