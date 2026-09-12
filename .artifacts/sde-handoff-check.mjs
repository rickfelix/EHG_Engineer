import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sd_phase_handoffs').select('*').eq('id','f1be16a0-365a-4972-9a5c-6ae8f9a3541f').maybeSingle();
console.log(JSON.stringify(data, null, 1));
