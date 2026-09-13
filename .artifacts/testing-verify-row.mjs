import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results').select('*')
  .eq('id', '033d01d8-6744-41a4-b35c-ba967cca97b5').single();
if (error) { console.log('ERR', error.message); process.exit(1); }
console.log('PERSISTED ROW CONFIRMED');
console.log('  id        :', data.id);
console.log('  sd_id     :', data.sd_id);
console.log('  code      :', data.sub_agent_code);
console.log('  phase     :', data.phase);
console.log('  verdict   :', data.verdict);
console.log('  created_at:', data.created_at);
console.log('  repo_path :', data.metadata?.repo_path);
console.log('  repo_resolved:', data.metadata?.repo_resolved);
console.log('  test_execution:', JSON.stringify(data.metadata?.test_execution));
console.log('  findings present:', Object.keys(data.detailed_analysis?.findings || {}).join(', ') || '(none)');
