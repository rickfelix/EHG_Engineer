import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results').select('*').eq('id','3f3399f7-20db-4612-99ec-7f34646529e8').single();
const d = {...data}; if (d.results) d.results = '<omitted>'; if (d.findings) d.findings='<omitted>';
console.log('KEYS:', Object.keys(data).join(','));
console.log(JSON.stringify(d, null, 1).slice(0,2500));
