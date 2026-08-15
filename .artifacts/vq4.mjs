import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// Full census (not a capped fetch grouped in memory -- page through)
let all = [], from = 0;
for (;;) {
  const { data, error } = await sb.from('sms_outbound_obligations').select('kind,status,created_at').range(from, from + 999);
  if (error) { console.error('ERR', error.message); break; }
  all = all.concat(data); if (data.length < 1000) break; from += 1000;
}
console.log('TOTAL ROWS:', all.length);
const byKind = {};
for (const r of all) { byKind[r.kind] ??= {}; byKind[r.kind][r.status] = (byKind[r.kind][r.status]||0)+1; }
console.log('--- kind x status census (all time) ---');
for (const [k,v] of Object.entries(byKind).sort()) console.log(' ', k, JSON.stringify(v));
const hb = all.filter(r => r.kind === 'heartbeat_status');
console.log('--- heartbeat_status: total', hb.length);
if (hb.length) {
  const sorted = hb.map(r=>r.created_at).sort();
  console.log('  earliest:', sorted[0], ' latest:', sorted[sorted.length-1]);
  const last72 = hb.filter(r => Date.now() - new Date(r.created_at).getTime() < 72*3600*1000);
  console.log('  last 72h:', last72.length, '| statuses:', JSON.stringify(last72.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})));
}
console.log('--- any heartbeat_status_backstop rows yet? ---', all.filter(r=>r.kind==='heartbeat_status_backstop').length);
