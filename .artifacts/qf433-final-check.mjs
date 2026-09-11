import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('quick_fixes').select('id, status, escalated_to_sd_id, resolution_sd_id, completed_at').eq('id','QF-20260903-433').maybeSingle();
console.log(JSON.stringify(data, null, 1));
const { data: sd } = await sb.from('strategic_directives_v2').select('status, completion_date, current_phase').eq('id','27eabc85-1de3-44e2-9b3b-8cb5eb87264b').maybeSingle();
console.log(JSON.stringify(sd, null, 1));
