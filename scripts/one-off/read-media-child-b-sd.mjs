import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('sd_key', 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B')
  .maybeSingle();
if (error) { console.error('ERR', error); process.exit(1); }
if (!data) { console.error('NO ROW'); process.exit(1); }
const keys = ['id','sd_key','title','status','current_phase','sd_type','priority','parent_sd_id','target_application','description','scope','success_criteria','risks','key_changes','dependencies','smoke_test_steps','strategic_objectives','acceptance_criteria'];
for (const k of keys) {
  console.log('\n=== ' + k + ' ===');
  const v = data[k];
  console.log(typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v));
}
console.log('\n=== metadata.mechanism_verifications ===');
console.log(JSON.stringify(data.metadata?.mechanism_verifications, null, 2));
console.log('\n=== metadata (other top keys) ===');
console.log(JSON.stringify(Object.keys(data.metadata || {})));
console.log('\n=== ALL COLUMNS ===');
console.log(JSON.stringify(Object.keys(data)));
