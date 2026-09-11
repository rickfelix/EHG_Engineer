import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('strategic_directives_v2').select('*').eq('id','b0331d11-b360-4fd1-b1e7-6b97676654bf').maybeSingle();
if (error) { console.error('ERR', error.message); process.exit(1); }
const r = data;
console.log('COLUMNS:', Object.keys(r).join(', '));
console.log('\n=== CORE ===');
for (const k of ['id','sd_key','title','status','current_phase','target_application','priority','sd_type','category','progress','is_working_on','parent_sd_id','scope','rationale','created_at','updated_at','approved_by','approval_date']) {
  console.log(`${k}:`, typeof r[k]==='object'? JSON.stringify(r[k]) : String(r[k]).slice(0,400));
}
console.log('\n=== success_criteria ===\n', JSON.stringify(r.success_criteria, null, 1));
console.log('\n=== success_metrics ===\n', JSON.stringify(r.success_metrics, null, 1));
console.log('\n=== strategic_objectives ===\n', JSON.stringify(r.strategic_objectives, null, 1));
console.log('\n=== key_changes ===\n', JSON.stringify(r.key_changes, null, 1));
console.log('\n=== risks ===\n', JSON.stringify(r.risks, null, 1));
console.log('\n=== dependencies ===\n', JSON.stringify(r.dependencies, null, 1));
console.log('\n=== METADATA KEYS ===', r.metadata ? Object.keys(r.metadata).join(', ') : 'null');
