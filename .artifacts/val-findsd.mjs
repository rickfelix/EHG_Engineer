import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
for (const col of ['sd_key','id','legacy_id']) {
  try {
    const { data, error } = await s.from('strategic_directives_v2').select('id, sd_key, sd_type, status, current_phase, target_application').eq(col, 'SD-LEARN-FIX-ADDRESS-PAT-LES-015');
    console.log(col, '->', error ? 'ERR '+error.message : JSON.stringify(data));
  } catch(e){ console.log(col,'EXC',e.message); }
}
const { data: like } = await s.from('strategic_directives_v2').select('id, sd_key, sd_type, status, current_phase, title, target_application').ilike('sd_key','%PAT-LES-015%');
console.log('\nILIKE PAT-LES-015:', JSON.stringify(like, null, 1));
