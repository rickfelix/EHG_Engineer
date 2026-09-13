import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from('strategic_directives_v2').select('id,sd_key,target_application,status,current_phase').eq('sd_key','SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D').maybeSingle();
console.log('sd:', JSON.stringify(data), error?.message || '');
const { data: apps } = await supabase.from('applications').select('id,name,local_path').limit(20);
console.log('apps:', JSON.stringify(apps, null, 1));
