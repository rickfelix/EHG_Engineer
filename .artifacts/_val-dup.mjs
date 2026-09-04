import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const terms = ['rework','KPI-0','coordinator-health','premature','pre-tool-enforce','enforce hook','SUBAGENT_EVIDENCE_MISSING','outcome flow','handoff precheck','evidence gate'];
const seen = new Map();
for (const t of terms) {
  const { data, error } = await s.from('strategic_directives_v2')
    .select('sd_key,status,current_phase,title,created_at')
    .or(`title.ilike.%${t}%,description.ilike.%${t}%`)
    .neq('sd_key','SD-LEO-FIX-KPI-COUNTS-CHEAP-001')
    .order('created_at',{ascending:false}).limit(25);
  if (error) { console.log('ERR', t, error.message); continue; }
  for (const r of data) {
    if (!seen.has(r.sd_key)) seen.set(r.sd_key, { r, hits: [] });
    seen.get(r.sd_key).hits.push(t);
  }
}
const rows = [...seen.values()].sort((a,b)=>b.hits.length-a.hits.length);
console.log('Overlapping SDs found:', rows.length);
for (const {r,hits} of rows.slice(0,20)) {
  console.log(`\n[${hits.length} hits: ${hits.join(',')}]\n  ${r.sd_key}  status=${r.status} phase=${r.current_phase} created=${String(r.created_at).slice(0,10)}\n  ${String(r.title).slice(0,175)}`);
}
