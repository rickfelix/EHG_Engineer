import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
const s = createSupabaseServiceClient();
const { data: sd } = await s.from('strategic_directives_v2').select('target_application, sd_key').eq('id', '11f9e1ac-a769-47f1-82b4-950a32a0d977').single();
console.log('SD target_application:', JSON.stringify(sd));
const { data: caps } = await s.from('leo_sub_agents').select('code, name, metadata').eq('code', 'STORIES').maybeSingle();
console.log('STORIES sub agent:', JSON.stringify(caps)?.slice(0, 800));
const { data: apps } = await s.from('applications').select('id, name, local_path').limit(20);
console.log('APPS:', JSON.stringify(apps, null, 2));
