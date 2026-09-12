import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
const supabase = await getSupabaseClient();
const { data, error } = await supabase
  .from('sub_agent_execution_results').select('*')
  .eq('id','546969e8-d2ba-4a15-8497-78e992a55890').maybeSingle();
if(error){console.error(error.message);process.exit(1);}
console.log('COLUMNS:', Object.keys(data).join(', '));
console.log('\n--- provenance-ish fields ---');
for (const k of Object.keys(data)) {
  if (/hash|prov|run|exec|repo|created|updated|phase|verdict|conf|mode|agent|sd_/i.test(k)) {
    const v = data[k];
    console.log(k, '=', typeof v === 'object' ? JSON.stringify(v).slice(0,400) : String(v).slice(0,200));
  }
}
console.log('\n--- metadata ---');
console.log(JSON.stringify(data.metadata, null, 2).slice(0, 3000));
