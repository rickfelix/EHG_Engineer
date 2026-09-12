import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
for (const k of ['SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-E','SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B','SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-F']) {
  const { data } = await sb.from('strategic_directives_v2').select('sd_key,title,description').eq('sd_key',k).single();
  console.log('\n===',k,'===\nTITLE:',data.title,'\nDESC:',(data.description||'').slice(0,1400));
}
