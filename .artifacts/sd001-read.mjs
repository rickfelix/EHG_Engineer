import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('strategic_directives_v2').select('*').eq('id','SD-LEO-FIX-ADAM-DURABLE-DUTY-001').maybeSingle();
if (error) { console.error(error); process.exit(1); }
console.log(JSON.stringify(data, null, 1));
