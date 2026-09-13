import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let all=[], from=0, PAGE=1000;
for(;;){
  const { data, error } = await sb.from('strategic_directives_v2').select('id,sd_key,status,updated_at,metadata').order('id').range(from, from+PAGE-1);
  if (error) { console.error('ERR', JSON.stringify(error)); process.exit(1); }
  all=all.concat(data);
  if (data.length < PAGE) break;
  from += PAGE;
}
console.log('TOTAL SD ROWS (paginated):', all.length);
const carriers = all.filter(r => r.metadata && r.metadata.fence_status_2026_08_17 !== undefined);
console.log('ROWS CARRYING fence_status_2026_08_17:', carriers.length);
for (const r of carriers) {
  const m=r.metadata, f=m.fence_status_2026_08_17;
  console.log('---', r.sd_key, '| status', r.status, '| updated', (r.updated_at||'').slice(0,19));
  console.log('    fence.state =', JSON.stringify(f && f.state), '| venture_gate_last_verdict =', JSON.stringify(m.venture_gate_last_verdict), '| checked_at =', JSON.stringify(m.venture_gate_last_checked_at));
}
const withV = all.filter(r=>r.metadata && r.metadata.venture_gate_last_verdict!==undefined);
console.log('\nROWS WITH venture_gate_last_verdict:', withV.length);
const vals={}; for(const r of withV){const v=JSON.stringify(r.metadata.venture_gate_last_verdict); vals[v]=(vals[v]||0)+1;}
console.log('distinct verdict values:', JSON.stringify(vals));
console.log('their sd_keys:', withV.map(r=>r.sd_key+'('+r.status+')').join(', '));
const states={}; for(const r of carriers){const s=JSON.stringify(r.metadata.fence_status_2026_08_17?.state); states[s]=(states[s]||0)+1;}
console.log('distinct fence.state values:', JSON.stringify(states));
