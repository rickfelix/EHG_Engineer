import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: sds, error: e1 } = await sb.from('strategic_directives_v2').select('id, uuid_id, sd_key, title, status, current_phase').ilike('sd_key','%CAPA-001%');
console.log('SDS:', JSON.stringify(sds, null, 1)?.slice(0,2000), 'err:', e1?.message);
const { data: ff, error: e3 } = await sb.from('leo_feature_flags').select('*').eq('flag_key','LEO_S24_CAPABILITY_CHECKLIST_REQUIRED');
console.log('FLAG:', JSON.stringify(ff), 'err:', e3?.message);
const { data: ff2 } = await sb.from('leo_feature_flags').select('flag_key,enabled').ilike('flag_key','%CAPABILITY%');
console.log('FLAGS LIKE CAPABILITY:', JSON.stringify(ff2));
