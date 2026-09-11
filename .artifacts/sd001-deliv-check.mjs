import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sd_scope_deliverables').select('deliverable_name, completion_status, user_story_id').eq('sd_id','27eabc85-1de3-44e2-9b3b-8cb5eb87264b');
for (const r of data) console.log(r.completion_status, '|', r.user_story_id, '|', r.deliverable_name.slice(0,60));
