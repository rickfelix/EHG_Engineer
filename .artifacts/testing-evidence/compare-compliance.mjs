import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ids = ['fd99a768-c6bc-4474-b775-be965579e9d0','e116fbce-eace-4dbd-8960-ee312ee272e3','b52f0fbb-bb3b-4194-b194-97647149aa19'];
const { data, error } = await sb.from('v_sub_agent_repo_compliance')
  .select('id, phase, compliance_status, metadata_repo_path, executed_from_cwd').in('id', ids);
if (error) { console.error(error.message); process.exit(1); }
for (const id of ids) {
  const r = data.find(x => x.id === id);
  console.log(r ? `${r.id.slice(0,8)}  phase=${String(r.phase).padEnd(12)} compliance=${r.compliance_status}` : `${id.slice(0,8)}  (not in view)`);
}
