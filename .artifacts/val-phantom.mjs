import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const s = createSupabaseServiceClient();
const cols = ['overall_result','executed_by','commit_sha','build_version','scenario_snapshot','total','passed','failed','skipped','defects_found','quick_fixes_created','quality_gate','status','sd_id','triggered_by','started_at','total_tests','passed_tests','failed_tests','pass_rate'];
console.log('COLUMN EXISTENCE PROBE on uat_test_runs:');
const missing=[], present=[];
for (const c of cols){
  const r = await s.from('uat_test_runs').select(c).limit(1);
  const ok = !r.error;
  (ok?present:missing).push(c);
  console.log(`  ${c.padEnd(22)} ${ok ? 'EXISTS' : 'MISSING  <-- ' + r.error.message.slice(0,70)}`);
}
console.log('\nMISSING:', JSON.stringify(missing));
console.log('PRESENT:', JSON.stringify(present));
