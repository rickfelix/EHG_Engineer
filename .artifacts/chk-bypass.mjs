import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
const supabase = await getSupabaseClient();
const uuid='dfdad20c-bf37-47ef-8588-0ebd82cfb874';
const { data, error } = await supabase.from('bypass_ledger').select('*')
  .or(`sd_id.eq.${uuid},sd_key.eq.SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E`)
  .order('created_at',{ascending:false}).limit(20);
if(error){ console.error('bypass_ledger ERR:', error.message); process.exit(1); }
console.log('bypass_ledger rows for this SD:', data.length);
for(const b of data) console.log(JSON.stringify(b).slice(0,500));
