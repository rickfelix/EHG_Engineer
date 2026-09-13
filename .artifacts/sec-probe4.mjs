import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
// emulate the backfill's idempotency probe when >1 row matches
const {data,error}=await sb.from('leo_feature_flag_audit_log').select('id').eq('flag_key','LEO_HIGH_CONSEQUENCE_GATES_ENABLED').maybeSingle();
console.log('maybeSingle on multi-row -> data=',data,' error=',error?.message,'code=',error?.code);
console.log('backfill would treat this as ABSENT (and insert):', !data);
