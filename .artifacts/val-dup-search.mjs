import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const s = createSupabaseServiceClient();
const ME = 'SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001';
// Broad keyword sweep across title+description+scope
const terms = ['uat','journey','journey_steps','journey-walk','walker','stage-20','stage 20','wait condition','prerequisite-check','type-aware-validator','uat_test_runs','playwright journey','wireframe','stage-15','stage 15','sprint orchestrator','click-through','user acceptance'];
const seen = new Map();
for (const t of terms) {
  for (const col of ['title','description','scope']) {
    const { data, error } = await s.from('strategic_directives_v2')
      .select('sd_key,title,status,current_phase,sd_type,created_at,target_application')
      .ilike(col, `%${t}%`)
      .neq('sd_key', ME)
      .limit(60);
    if (error) { console.error('ERR', t, col, error.message); continue; }
    for (const r of (data||[])) {
      if (!seen.has(r.sd_key)) seen.set(r.sd_key, { ...r, hits: new Set() });
      seen.get(r.sd_key).hits.add(t);
    }
  }
}
const rows = [...seen.values()].sort((a,b)=> (b.created_at||'').localeCompare(a.created_at||''));
console.log('TOTAL CANDIDATES:', rows.length);
for (const r of rows) {
  console.log(`${(r.status||'').padEnd(10)} ${(r.current_phase||'-').padEnd(14)} ${(r.sd_type||'-').padEnd(14)} ${(r.created_at||'').slice(0,10)} ${r.sd_key}`);
  console.log(`    ${String(r.title).slice(0,150)}`);
  console.log(`    hits: ${[...r.hits].join(',')}`);
}
