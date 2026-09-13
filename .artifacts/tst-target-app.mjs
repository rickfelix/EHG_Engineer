import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('strategic_directives_v2').select('sd_key,target_application,status').eq('id','fbbf9a6d-e079-4c22-9189-88336aae9a16').single();
console.log('SD:', JSON.stringify(data, null, 2));
const { data: apps } = await sb.from('applications').select('name,local_path').limit(10);
console.log('applications:', JSON.stringify(apps, null, 2));
