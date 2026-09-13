import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const {data}=await sb.from('strategic_directives_v2').select('id,sd_key,status,current_phase,target_application').eq('sd_key','SD-LEO-FIX-CHAIRMAN-APPROVED-ARMING-001').maybeSingle();
console.log(JSON.stringify(data,null,1));
