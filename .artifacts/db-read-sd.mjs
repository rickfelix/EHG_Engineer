import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const sb = createClient(url, key);
const { data, error } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase,description')
  .eq('sd_key','SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001').maybeSingle();
if (error) { console.error(error); process.exit(1); }
console.log('=== ID:', data.id, '| status:', data.status, '| phase:', data.current_phase);
console.log('=== TITLE:', data.title);
console.log('=== DESCRIPTION LENGTH:', (data.description||'').length);
console.log(data.description);
