import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb
  .from('sub_agent_execution_results')
  .select('*')
  .eq('sd_id', 'fbbf9a6d-e079-4c22-9189-88336aae9a16')
  .eq('sub_agent_code', 'TESTING')
  .order('created_at', { ascending: false })
  .limit(1);
if (error) { console.error('SELECT ERROR:', error); process.exit(1); }
const row = data[0];
console.log('columns:', Object.keys(row).join(', '));
console.log('');
for (const k of ['sub_agent_name', 'verdict', 'confidence', 'phase', 'execution_mode', 'handoff_type', 'status']) {
  if (k in row) console.log(k + ':', JSON.stringify(row[k]));
}
console.log('metadata.repo_resolved:', row.metadata?.repo_resolved, '| registry_source:', row.metadata?.registry_source, '| repo_path:', row.metadata?.repo_path);

const { data: sd, error: sdErr } = await sb
  .from('strategic_directives_v2')
  .select('sd_key, target_application')
  .eq('id', 'fbbf9a6d-e079-4c22-9189-88336aae9a16');
if (sdErr) { console.error('SD SELECT ERROR:', sdErr); } else { console.log('SD:', JSON.stringify(sd)); }
