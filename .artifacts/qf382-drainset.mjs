import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('role_drain_sets').select('*').eq('role','solomon').limit(100);
console.log('ERR', error?.message, 'ROWS', data?.length, JSON.stringify(data?.map(r=>({k:r.kind, s:r.status, d:r.direction})), null, 0));
