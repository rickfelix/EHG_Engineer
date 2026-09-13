import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('strategic_directives_v2').select('id,sd_key,status,updated_at,metadata');
if (error) { console.error('ERR', JSON.stringify(error)); process.exit(1); }
console.log('TOTAL SD ROWS:', data.length);
const carriers = data.filter(r => r.metadata && r.metadata.fence_status_2026_08_17 !== undefined);
console.log('ROWS CARRYING fence_status_2026_08_17:', carriers.length);
for (const r of carriers) {
  const m=r.metadata;
  const f=m.fence_status_2026_08_17;
  console.log('---', r.sd_key, '| status', r.status, '| updated_at', (r.updated_at||'').slice(0,19));
  console.log('   fence.state        =', JSON.stringify(f && f.state));
  console.log('   venture_gate_last_verdict =', JSON.stringify(m.venture_gate_last_verdict));
  console.log('   venture_gate_last_checked_at =', JSON.stringify(m.venture_gate_last_checked_at));
  console.log('   fence sibling keys =', f && typeof f==='object' ? Object.keys(f).join(', ') : typeof f);
  console.log('   MISMATCH (state vs verdict vocab):', JSON.stringify(f&&f.state), 'vs', JSON.stringify(m.venture_gate_last_verdict));
}
// also: how many rows have venture_gate_last_verdict at all, and distinct values
const withV = data.filter(r=>r.metadata && r.metadata.venture_gate_last_verdict!==undefined);
console.log('\nROWS WITH venture_gate_last_verdict:', withV.length);
const vals={};
for(const r of withV){const v=JSON.stringify(r.metadata.venture_gate_last_verdict); vals[v]=(vals[v]||0)+1;}
console.log('distinct verdict values:', JSON.stringify(vals,null,2));
console.log('sd_keys:', withV.map(r=>r.sd_key).join(', '));
