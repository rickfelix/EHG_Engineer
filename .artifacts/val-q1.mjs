import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const sb = createSupabaseServiceClient();
const { data: me, error: e0 } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase,priority,created_at,scope,metadata')
  .eq('id','SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001').maybeSingle();
console.log('=== THIS SD ===');
if (e0) console.log('ERR', e0.message); else console.log(JSON.stringify(me, null, 2)?.slice(0,3000));

const terms = ['actor','app.actor','audit','attribution','created_by','session_user','mutation_audit','provenance','identity'];
console.log('\n=== CANDIDATE OVERLAP SDs (title/scope/description ilike) ===');
for (const t of terms) {
  const { data, error } = await sb.from('strategic_directives_v2')
    .select('id,sd_key,title,status,current_phase,created_at')
    .or(`title.ilike.%${t}%,description.ilike.%${t}%,scope.ilike.%${t}%`)
    .order('created_at', { ascending: false })
    .limit(25);
  if (error) { console.log(t, 'ERR', error.message); continue; }
  console.log(`\n-- term: ${t} (${data.length})`);
  for (const r of data) console.log(`   ${r.id} | ${r.status}/${r.current_phase} | ${r.created_at?.slice(0,10)} | ${r.title?.slice(0,100)}`);
}
