import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase,target_application,priority,scope,description,metadata,created_at,updated_at')
  .eq('sd_key','SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001').maybeSingle();
if (error) { console.error('ERR', JSON.stringify(error)); process.exit(1); }
if (!data) { console.log('NOT FOUND by sd_key'); process.exit(0); }
const { metadata, ...rest } = data;
console.log(JSON.stringify(rest, null, 2));
console.log('=== METADATA KEYS ===');
console.log(Object.keys(metadata||{}).join(', '));
console.log('=== FUNCTIONAL REQUIREMENTS ===');
console.log(JSON.stringify(metadata?.functional_requirements, null, 2));
