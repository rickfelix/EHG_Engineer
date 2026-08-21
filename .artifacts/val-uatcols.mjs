import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const s = createSupabaseServiceClient();
// Probe uat_test_runs columns by selecting * on one row
const { data, error } = await s.from('uat_test_runs').select('*').limit(1);
console.log('uat_test_runs select * error:', error?.message || 'none');
console.log('row count returned:', (data||[]).length);
if (data && data.length) console.log('COLUMNS:', JSON.stringify(Object.keys(data[0])));
else {
  // no rows -> probe individual columns
  for (const c of ['overall_result','status','id','result','verdict','sd_id','sd_key']) {
    const r = await s.from('uat_test_runs').select(c).limit(1);
    console.log(`  col ${c.padEnd(16)} -> ${r.error ? 'ERR: '+r.error.message : 'OK'}`);
  }
}
// total rows
const c = await s.from('uat_test_runs').select('*',{count:'exact',head:true});
console.log('uat_test_runs total rows:', c.count, c.error?.message||'');
