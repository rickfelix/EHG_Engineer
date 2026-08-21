import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const s = createSupabaseServiceClient();
const ME = 'SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001';

// 1) FULL in-flight population (non-terminal), paginated -- no cap illusion
const TERMINAL = ['completed','cancelled','archived','superseded','rejected'];
let all = [], from = 0;
for(;;){
  const { data, error } = await s.from('strategic_directives_v2')
    .select('sd_key,title,status,current_phase,sd_type,created_at,scope,description')
    .not('status','in',`(${TERMINAL.join(',')})`)
    .order('created_at',{ascending:false})
    .range(from, from+499);
  if (error){ console.error('ERR', error.message); break; }
  all = all.concat(data||[]);
  if (!data || data.length < 500) break;
  from += 500;
}
console.log('IN-FLIGHT (non-terminal) POPULATION:', all.length);

const terms = ['uat','journey','walker','stage-20','stage 20','wait condition','prerequisite-check','type-aware-validator','uat_test_runs','wireframe','sprint orchestrator','user acceptance','journey_steps','click-through','acceptance'];
const hits = [];
for (const r of all){
  if (r.sd_key === ME) continue;
  const blob = `${r.title||''} ${r.scope||''} ${r.description||''}`.toLowerCase();
  const m = terms.filter(t => blob.includes(t));
  if (m.length) hits.push({ ...r, m });
}
console.log('IN-FLIGHT KEYWORD HITS:', hits.length);
for (const r of hits){
  console.log(`\n${(r.status||'').padEnd(12)} ${(r.current_phase||'-').padEnd(14)} ${(r.sd_type||'-').padEnd(14)} ${(r.created_at||'').slice(0,10)} ${r.sd_key}`);
  console.log(`   ${String(r.title).slice(0,170)}`);
  console.log(`   terms: ${r.m.join(',')}`);
}

// 2) RECENT SDs (any status) since 2026-05-01 with strong terms
const strong = ['uat','journey','stage-20','stage 20','wait condition','type-aware-validator','uat_test_runs','journey_steps'];
let rec = [], f2 = 0;
for(;;){
  const { data, error } = await s.from('strategic_directives_v2')
    .select('sd_key,title,status,current_phase,sd_type,created_at,scope,description')
    .gte('created_at','2026-05-01')
    .order('created_at',{ascending:false})
    .range(f2, f2+499);
  if (error){ console.error('ERR2', error.message); break; }
  rec = rec.concat(data||[]);
  if (!data || data.length < 500) break;
  f2 += 500;
}
console.log(`\n\n=== RECENT POPULATION (>=2026-05-01): ${rec.length} ===`);
const rh = rec.filter(r=>{
  if (r.sd_key===ME) return false;
  const blob = `${r.title||''} ${r.scope||''} ${r.description||''}`.toLowerCase();
  return strong.some(t=>blob.includes(t));
});
console.log('RECENT STRONG-TERM HITS:', rh.length);
for (const r of rh){
  const blob = `${r.title||''} ${r.scope||''} ${r.description||''}`.toLowerCase();
  console.log(`\n${(r.status||'').padEnd(12)} ${(r.current_phase||'-').padEnd(14)} ${(r.sd_type||'-').padEnd(14)} ${(r.created_at||'').slice(0,10)} ${r.sd_key}`);
  console.log(`   ${String(r.title).slice(0,170)}`);
  console.log(`   terms: ${strong.filter(t=>blob.includes(t)).join(',')}`);
}
