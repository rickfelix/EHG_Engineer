import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results').select('*').eq('id','2e187d5b-e69b-4b24-87dc-3165a4175928').single();
const { results, metadata, ...rest } = data;
console.log(JSON.stringify(rest, null, 1).slice(0, 3000));
console.log('RESULTS:', JSON.stringify(results, null, 1).slice(0, 4000));
console.log('META:', JSON.stringify(metadata, null, 1).slice(0, 2000));
