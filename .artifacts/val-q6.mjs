import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const sb = createSupabaseServiceClient();
// duplicate QFs
const { data: qf } = await sb.from('quick_fixes')
  .select('id,qf_key,title,status,created_at')
  .or('title.ilike.%actor%,title.ilike.%created_by%,title.ilike.%audit%attribut%,description.ilike.%app.actor%')
  .order('created_at',{ascending:false}).limit(20);
console.log('=== candidate QFs ==='); for (const r of qf||[]) console.log(` ${r.qf_key||r.id} | ${r.status} | ${r.created_at?.slice(0,10)} | ${r.title?.slice(0,95)}`);
// chairman-gated pending ceremonies (is there a queue this must join?)
for (const t of ['chairman_decisions','chairman_gated_migrations']) {
  const { data, error } = await sb.from(t).select('*').limit(3);
  console.log(`\n${t}: ${error ? 'ERR '+error.message : (data?.length+' rows sampled; cols='+Object.keys(data?.[0]||{}).slice(0,14).join(','))}`);
}
