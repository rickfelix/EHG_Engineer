import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('applications').select('id,name,local_path,github_repo,status').order('name');
for (const a of (data||[])) console.log(`${a.name} | ${a.local_path||'-'} | ${a.github_repo||'-'} | ${a.status||'-'}`);
