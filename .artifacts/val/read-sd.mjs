import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let { data } = await s.from('strategic_directives_v2').select('*').eq('id','SD-LEO-INFRA-TREND-EYES-OFF-001').maybeSingle();
if (!data) { const r2 = await s.from('strategic_directives_v2').select('*').eq('sd_key','SD-LEO-INFRA-TREND-EYES-OFF-001').maybeSingle(); data = r2.data; }
if (!data) { console.log('NO SD ROW FOUND'); process.exit(0); }
for (const [k,v] of Object.entries(data)) {
  if (v === null || v === undefined) continue;
  const str = typeof v === 'string' ? v : JSON.stringify(v);
  console.log(`\n### ${k} ###\n${str.slice(0,6000)}`);
}
