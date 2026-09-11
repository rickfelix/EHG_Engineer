import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('strategic_directives_v2').select('*').or("sd_key.eq.SD-LEO-FIX-ADAM-DURABLE-DUTY-001,sd_code_user_facing.eq.SD-LEO-FIX-ADAM-DURABLE-DUTY-001,id.eq.27eabc85-1de3-44e2-9b3b-8cb5eb87264b").maybeSingle();
if (error) { console.error(error); process.exit(1); }
console.log(JSON.stringify(data, null, 1));
