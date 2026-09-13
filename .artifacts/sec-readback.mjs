import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id, sub_agent_code, verdict, phase, confidence, source, created_at, summary, metadata')
  .eq('sd_id', '79975086-927e-4c35-a6f6-4a47ed972a2a')
  .eq('sub_agent_code', 'SECURITY')
  .order('created_at', { ascending: false });
if (error) { console.error('ERR', error.message); process.exit(1); }
for (const r of data) {
  console.log('---');
  console.log('id        :', r.id);
  console.log('verdict   :', r.verdict, '| phase:', r.phase, '| conf:', r.confidence, '| source:', r.source);
  console.log('created_at:', r.created_at);
  console.log('repo_path :', r.metadata?.repo_path);
  console.log('round     :', r.metadata?.review_round, '| fix_commit:', r.metadata?.fix_commit);
  console.log('has_hash  :', !!r.metadata?.content_hash, '| invocation set:', !!r.metadata?.invocation_id || 'see col');
  console.log('summary   :', (r.summary || '').slice(0, 110) + '...');
}
console.log('\nTOTAL SECURITY rows:', data.length);
