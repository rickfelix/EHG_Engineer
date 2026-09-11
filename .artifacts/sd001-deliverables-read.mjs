import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sd_scope_deliverables').select('*').eq('sd_id','27eabc85-1de3-44e2-9b3b-8cb5eb87264b');
console.log(JSON.stringify(data, null, 1), error?.message);
