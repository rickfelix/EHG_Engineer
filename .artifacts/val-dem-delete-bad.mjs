import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results').delete().eq('id','071cad80-c2b0-4d5c-8f1b-8f94b121bfb8').select('id');
console.log('deleted:', JSON.stringify(data), 'err:', error?.message||'none');
