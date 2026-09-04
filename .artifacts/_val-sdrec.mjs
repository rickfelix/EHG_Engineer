import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('strategic_directives_v2').select('*').eq('sd_key','SD-LEO-FIX-KPI-COUNTS-CHEAP-001').maybeSingle();
if (error) { console.error('ERR', error); process.exit(1); }
if (!data) { console.error('NOT FOUND'); process.exit(1); }
const keys = ['id','sd_key','status','current_phase','priority','category','title','description','scope','strategic_intent','rationale','key_changes','risks','success_criteria','success_metrics','strategic_objectives','metadata','parent_sd_id','is_working_on','created_at','updated_at'];
for (const k of keys) {
  const v = data[k];
  if (v === null || v === undefined) { console.log(`\n### ${k}: <null>`); continue; }
  console.log(`\n### ${k}:`);
  console.log(typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v));
}
console.log('\n### ALL COLUMNS:', Object.keys(data).join(', '));
