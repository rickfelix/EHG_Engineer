import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SELF = 'SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001';

// 1. All SDs mentioning michael
const { data: mich, error: e1 } = await sb.from('strategic_directives_v2')
  .select('sd_key,title,status,current_phase,created_at,updated_at')
  .or('sd_key.ilike.%MICHAEL%,title.ilike.%michael%')
  .order('created_at', { ascending: false });
console.log('=== SDs matching MICHAEL (key or title):', e1 ? 'ERR '+JSON.stringify(e1) : mich.length);
for (const r of (mich||[])) console.log(`  ${r.status.padEnd(10)} ${r.current_phase||'-'} ${r.sd_key}${r.sd_key===SELF?'  <-- SELF':''}\n      ${r.title.slice(0,150)}`);

// 2. SDs whose description mentions sending sms/text at michael seat
const terms = ['%send%sms%','%sms%michael%','%michael%sms%','%text message%','%twilio%'];
for (const t of terms) {
  const { data, error } = await sb.from('strategic_directives_v2')
    .select('sd_key,title,status,current_phase,created_at')
    .ilike('description', t).order('created_at',{ascending:false}).limit(25);
  console.log(`\n=== description ILIKE '${t}':`, error ? 'ERR '+JSON.stringify(error) : (data||[]).length);
  for (const r of (data||[])) console.log(`  ${r.status.padEnd(10)} ${r.sd_key}${r.sd_key===SELF?'  <-- SELF':''} :: ${r.title.slice(0,120)}`);
}
