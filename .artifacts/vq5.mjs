import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let all = [], from = 0;
for (;;) {
  const { data, error } = await sb.from('sms_outbound_obligations').select('kind,status,created_at').eq('kind','heartbeat_status').range(from, from+999);
  if (error) { console.error(error.message); break; }
  all = all.concat(data); if (data.length < 1000) break; from += 1000;
}
const ts = all.map(r => new Date(r.created_at).getTime()).sort((a,b)=>a-b);
console.log('heartbeat_status rows:', ts.length);
const LOOKBACK = 65*60*1000;
// Only count gaps that BEGIN inside the backstop's active window (06:00-21:59 ET),
// since outside it the sweep is inert and a gap cannot trigger a fill.
const fmtHour = (t) => Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hour12:false}).format(new Date(t)));
let gaps = [];
for (let i=1;i<ts.length;i++) {
  const h = fmtHour(ts[i]);           // hour at which the NEXT beat landed
  if (h >= 6 && h < 22) gaps.push({ ms: ts[i]-ts[i-1], at: new Date(ts[i]).toISOString(), h });
}
gaps.sort((a,b)=>a.ms-b.ms);
const p = (q) => Math.round(gaps[Math.floor(gaps.length*q)].ms/60000);
console.log('in-window consecutive gaps:', gaps.length);
console.log(`  p50=${p(.5)}m p75=${p(.75)}m p90=${p(.90)}m p95=${p(.95)}m max=${Math.round(gaps[gaps.length-1].ms/60000)}m`);
const over = gaps.filter(g => g.ms > LOOKBACK);
console.log(`  gaps > LOOKBACK_MS (65m): ${over.length} / ${gaps.length} = ${(100*over.length/gaps.length).toFixed(1)}%  <-- would trigger a backstop fill`);
const near = gaps.filter(g => g.ms > 60*60*1000 && g.ms <= LOOKBACK);
console.log(`  gaps in 60-65m grace band (saved from a spurious fill by STALENESS_GRACE_MS): ${near.length}`);
console.log('  largest 8 in-window gaps (min):', over.slice(-8).map(g=>`${Math.round(g.ms/60000)}m@${g.at.slice(5,16)}`).join(', '));
