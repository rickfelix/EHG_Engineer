import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from('sub_agent_execution_results').select('*').eq('id', 'e0dc9fd5-ee57-4833-aea4-de142acfa758').single();
if (error) { console.error(error); process.exit(1); }
console.log(JSON.stringify(data, null, 2));
