import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
import { normalizeSDId } from '../scripts/modules/sd-id-normalizer.js';
const supabase = await getSupabaseClient();
const uuid = await normalizeSDId(supabase, 'SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E');
const { data } = await supabase
  .from('sub_agent_execution_results')
  .select('id,sub_agent_code,phase,verdict,confidence,validation_mode,created_at')
  .eq('sd_id', uuid).order('created_at',{ascending:false});
console.log('== ALL ROWS ==', data.length);
console.table(data.map(r=>({code:r.sub_agent_code,phase:r.phase,verdict:r.verdict,conf:r.confidence,mode:r.validation_mode,at:r.created_at})));
console.log('== SECURITY ROWS ==');
const sec = data.filter(r=>r.sub_agent_code==='SECURITY');
console.log(JSON.stringify(sec,null,2));
