import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('=== SDs with TREND in the TITLE (tight overlap candidates) ===');
const { data: t } = await s.from('strategic_directives_v2').select('sd_key,title,status,current_phase,created_at').ilike('title','%trend%').order('created_at',{ascending:false});
for (const r of t||[]) console.log(`[${r.status}|${r.current_phase}] ${r.sd_key}\n    ${r.title.slice(0,160)}`);

console.log('\n=== SDs titled about SERIES / LONGITUDINAL / TIME-SERIES ===');
for (const term of ['longitudinal','time-series','timeseries','standing series','second set of eyes','trend detection']) {
  const { data } = await s.from('strategic_directives_v2').select('sd_key,title,status').or(`title.ilike.%${term}%,description.ilike.%${term}%`).limit(15);
  if (data?.length) { console.log(`\n-- "${term}" (${data.length}) --`); for (const r of data) console.log(`  [${r.status}] ${r.sd_key}: ${r.title.slice(0,120)}`); }
  else console.log(`\n-- "${term}": 0 matches --`);
}

console.log('\n=== IN-FLIGHT (non-completed) SDs mentioning solomon or trend ===');
const { data: live } = await s.from('strategic_directives_v2').select('sd_key,title,status,current_phase,active_session_id')
  .not('status','in','("completed","cancelled","archived","deferred")')
  .or('title.ilike.%solomon%,title.ilike.%trend%,description.ilike.%solomon_trend%');
for (const r of live||[]) console.log(`[${r.status}|${r.current_phase}|sess=${r.active_session_id?'CLAIMED':'free'}] ${r.sd_key}: ${r.title.slice(0,130)}`);
