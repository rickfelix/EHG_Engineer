import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false}});
const { data, error } = await s.from('sub_agent_execution_results').select('*').eq('id','0e954688-e196-4498-b5ad-6d30f63fe907').single();
if (error) { console.log('ERR', error.message); process.exit(1); }
console.log('sd_id      :', data.sd_id);
console.log('sub_agent  :', data.sub_agent_code);
console.log('phase      :', data.phase, '| metadata.phase:', data.metadata?.phase);
console.log('verdict    :', data.verdict, '| original:', data.metadata?.original_verdict);
console.log('confidence :', data.confidence_score);
console.log('created_at :', data.created_at);
console.log('repo_path  :', data.metadata?.repo_path);
console.log('exec_cwd   :', data.metadata?.executed_from_cwd);
console.log('repo_resolved:', data.metadata?.repo_resolved, '| registry_source:', data.metadata?.registry_source);
console.log('test_execution:', JSON.stringify(data.metadata?.test_execution));
console.log('provenance :', JSON.stringify(data.metadata?.evidence_provenance));
console.log('recs count :', (data.recommendations||[]).length);
