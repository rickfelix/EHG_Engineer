import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb=createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const {data}=await sb.from('sub_agent_execution_results').select('*').eq('sub_agent_code','REGRESSION').order('created_at',{ascending:false}).limit(1);
console.log(JSON.stringify(Object.keys(data?.[0]||{}),null,0));
console.log('SAMPLE_VERDICT', data?.[0]?.verdict, '| phase', data?.[0]?.phase);
