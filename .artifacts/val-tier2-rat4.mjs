import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('chairman_ratifications').select('*').limit(1000);
for (const w of ['561878ae','b9d3607e']) {
  const h = data.find(r=>String(r.id||'').startsWith(w));
  console.log(`\n=== ${w} ===`);
  console.log(' ratified_at:', h.ratified_at, '| scribe:', h.scribe_seat);
  console.log(' target_contracts:', JSON.stringify(h.target_contracts));
  console.log(' encoded_at:', h.encoded_at, '| encoded_ref:', h.encoded_ref);
  console.log(' marker_text:', String(h.marker_text||'').slice(0,200));
}
const { data: qf } = await sb.from('quick_fixes')
  .select('id,title,status,created_at,metadata,description')
  .or('title.ilike.%michael%,title.ilike.%Tier-1%').eq('status','open')
  .order('created_at',{ascending:false}).limit(10);
console.log('\n=== OPEN michael/tier-1 QFs (full) ===');
for (const r of (qf||[])) console.log(`\n [${String(r.id).slice(0,8)}] ${r.created_at}\n  ${r.title}\n  desc: ${String(r.description||'').slice(0,400)}`);
