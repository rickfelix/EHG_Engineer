import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const sb = createSupabaseServiceClient();
const { data } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase,created_at')
  .or('sd_key.ilike.%STRATEGIC-DIRECTIVES%,sd_key.ilike.%SD-CANONICAL%,title.ilike.%canonical%SD%')
  .order('created_at',{ascending:false}).limit(15);
console.log('=== candidates ==='); for (const r of data||[]) console.log(` ${r.sd_key} | ${r.status}/${r.current_phase} | ${r.created_at?.slice(0,10)} | ${r.title?.slice(0,95)}`);

// SDs currently active/in-flight that could collide on the two factories
const { data: live } = await sb.from('strategic_directives_v2')
  .select('sd_key,title,status,current_phase,claiming_session_id')
  .in('status',['active','in_progress','draft'])
  .order('created_at',{ascending:false}).limit(60);
console.log('\n=== in-flight SDs mentioning supabase client/connection in title ===');
for (const r of live||[]) if (/supabase|client factor|connection|createClient/i.test(r.title||'')) console.log(` ${r.sd_key} | ${r.status}/${r.current_phase} | ${r.title?.slice(0,95)}`);
console.log(`(scanned ${live?.length} in-flight)`);

// explore evidence rows for canonical-001
const { data: ev, error } = await sb.from('sub_agent_execution_results')
  .select('sd_id,sub_agent_code,verdict,created_at,metadata')
  .ilike('sd_id','%CANONICAL%').order('created_at',{ascending:false}).limit(10);
console.log('\n=== evidence rows (canonical) ===', error? error.message : (ev||[]).map(r=>`${r.sd_id}|${r.sub_agent_code}|${r.verdict}`).join('\n'));
