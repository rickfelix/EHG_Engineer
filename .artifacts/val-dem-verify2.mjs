import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results').select('*').eq('id','071cad80-c2b0-4d5c-8f1b-8f94b121bfb8').maybeSingle();
console.log('ERR:', error?.message || 'none');
if (data) {
  console.log('sub_agent_code:', data.sub_agent_code, '| verdict:', data.verdict, '| phase:', data.phase, '| sd_id:', data.sd_id);
  console.log('confidence_score:', data.confidence_score, '| created_at:', data.created_at);
  console.log('metadata.repo_path:', JSON.stringify(data.metadata?.repo_path));
  console.log('metadata.repo_resolved:', data.metadata?.repo_resolved, '| registry_source:', data.metadata?.registry_source, '| skip_reason:', JSON.stringify(data.metadata?.skip_reason));
  console.log('conditions count:', (data.metadata?.conditions || data.conditions || []).length);
}
