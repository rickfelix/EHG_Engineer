import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('strategic_directives_v2')
  .select('sd_key,status,current_phase,title,updated_at')
  .not('status','in','("completed","cancelled","archived")')
  .neq('sd_key','SD-LEO-FIX-KPI-COUNTS-CHEAP-001')
  .or('title.ilike.%pre-tool-enforce%,description.ilike.%pre-tool-enforce%,scope.ilike.%pre-tool-enforce%,title.ilike.%coordinator-health%,description.ilike.%coordinator-health%,scope.ilike.%coordinator-health%,description.ilike.%rework_rate%,description.ilike.%premature%,description.ilike.%SUBAGENT_EVIDENCE_MISSING%')
  .order('updated_at',{ascending:false});
if (error) { console.log('ERR', error.message); process.exit(1); }
console.log('NON-COMPLETED SDs touching the same files/concepts:', data.length);
for (const r of data) console.log(`  ${r.sd_key} | ${r.status}/${r.current_phase} | upd=${String(r.updated_at).slice(0,10)}\n     ${String(r.title).slice(0,160)}`);
