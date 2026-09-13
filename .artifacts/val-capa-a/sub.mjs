import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: one } = await sb.from('sub_agent_execution_results').select('*').limit(1);
console.log('COLS:', one && one[0] ? Object.keys(one[0]).join(', ') : 'none');
const SDU='566eb446-0f7c-4fbb-8d39-d0584bdd417f', SDK='SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A';
for (const col of ['sd_id','sd_key','sd_uuid']) {
  const { data, error } = await sb.from('sub_agent_execution_results').select('sub_agent_code,verdict,phase,created_at,metadata').eq(col, col==='sd_key'?SDK:SDU).order('created_at',{ascending:false}).limit(30);
  if (error) { console.log(col,'->',error.message.slice(0,60)); continue; }
  console.log(`\n=== by ${col}: ${data.length} rows`);
  for (const r of data) console.log(`  ${r.created_at} ${String(r.phase).padEnd(22)} ${String(r.sub_agent_code).padEnd(12)} ${r.verdict}  repo=${r.metadata?.repo_path||'-'}`);
}
