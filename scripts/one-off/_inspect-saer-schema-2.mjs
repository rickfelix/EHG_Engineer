import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env', quiet: true });
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// Get one TESTING-coded row from anywhere to see typical payload
const { data, error } = await supabase.from('sub_agent_execution_results').select('*').eq('sub_agent_code', 'TESTING').order('created_at', { ascending: false }).limit(1);
console.log('error:', error);
console.log(JSON.stringify(data, null, 2));
