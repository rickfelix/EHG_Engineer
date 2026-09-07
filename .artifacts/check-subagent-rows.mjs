import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);
const sdId = '89c9c119-611f-4801-bf19-9a9d98751bfe';
const { data, error } = await supabase.from('sub_agent_execution_results').select('id, sub_agent_code, phase, verdict, confidence, created_at, sd_id').eq('sd_id', sdId).order('created_at', {ascending:true});
console.log(JSON.stringify({data, error}, null, 2));
