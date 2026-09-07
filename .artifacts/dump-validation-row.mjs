import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from('sub_agent_execution_results').select('*').eq('id', '5afd2c6f-7052-440c-9ff4-45b41be0df25').single();
console.log(JSON.stringify(data, null, 2));
console.log(error);
