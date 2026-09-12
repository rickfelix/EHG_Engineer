import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('session_coordination').select('payload').eq('id','885ad953-6288-45db-9e16-4a2e26684afc').maybeSingle();
console.log(JSON.stringify(data?.payload, null, 1));
