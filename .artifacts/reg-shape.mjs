import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results').select('*').eq('sub_agent_code','REGRESSION').order('created_at',{ascending:false}).limit(2);
console.log('err', error?.message);
if (data?.[0]) { console.log('KEYS:', Object.keys(data[0]).join(',')); console.log(JSON.stringify(data[0], null, 1).slice(0,2500)); }
const { data: mine } = await sb.from('sub_agent_execution_results').select('id,sub_agent_code,phase,verdict,created_at').or('sd_id.eq.533215d8-1305-4589-9a8b-d767b7ce8008,sd_id.eq.79975086-927e-4c35-a6f6-4a47ed972a2a').order('created_at',{ascending:false}).limit(10);
console.log('MINE:', JSON.stringify(mine));
