import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,status,updated_at,metadata')
  .eq('sd_key','SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-E');
if (error) { console.error('ERR', JSON.stringify(error)); process.exit(1); }
console.log('ROWS FOUND:', data.length);
for (const r of data) {
  console.log('--- sd_key', r.sd_key, 'status', r.status, 'updated_at', r.updated_at);
  const m = r.metadata || {};
  const keys = Object.keys(m);
  console.log('metadata key count:', keys.length);
  console.log('has venture_gate_last_verdict:', Object.prototype.hasOwnProperty.call(m,'venture_gate_last_verdict'));
  console.log('venture_gate_last_verdict VALUE:', JSON.stringify(m.venture_gate_last_verdict));
  console.log('has fence_status_2026_08_17:', Object.prototype.hasOwnProperty.call(m,'fence_status_2026_08_17'));
  console.log('fence_status_2026_08_17 VALUE:', JSON.stringify(m.fence_status_2026_08_17, null, 2));
  console.log('keys matching /venture_gate/:', keys.filter(k=>/venture_gate/i.test(k)));
}
