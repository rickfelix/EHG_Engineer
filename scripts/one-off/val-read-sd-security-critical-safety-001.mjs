import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('strategic_directives_v2').select('*').eq('sd_key','SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001').maybeSingle();
if (error) { console.error('ERR', error); process.exit(1); }
if (!data) { console.error('NO ROW'); process.exit(1); }
console.log('=== COLUMNS PRESENT ===');
console.log(Object.keys(data).join(', '));
for (const k of ['id','sd_key','title','status','current_phase','priority','category','target_application','progress','created_at','updated_at']) {
  console.log(`${k}: ${JSON.stringify(data[k])}`);
}
console.log('\n=== DESCRIPTION ===\n' + (data.description||'(null)'));
console.log('\n=== SCOPE ===\n' + JSON.stringify(data.scope,null,2));
console.log('\n=== SUCCESS_CRITERIA ===\n' + JSON.stringify(data.success_criteria,null,2));
console.log('\n=== RISKS ===\n' + JSON.stringify(data.risks,null,2));
console.log('\n=== KEY_CHANGES ===\n' + JSON.stringify(data.key_changes,null,2));
console.log('\n=== STRATEGIC_INTENT ===\n' + JSON.stringify(data.strategic_intent,null,2));
console.log('\n=== RATIONALE ===\n' + JSON.stringify(data.rationale,null,2));
console.log('\n=== METADATA KEYS ===\n' + Object.keys(data.metadata||{}).join(', '));
console.log('\n=== METADATA FULL ===\n' + JSON.stringify(data.metadata,null,2));
