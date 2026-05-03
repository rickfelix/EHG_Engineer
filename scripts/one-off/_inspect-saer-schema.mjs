import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env', quiet: true });
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await supabase.from('sub_agent_execution_results').select('*').limit(1);
console.log('select error:', error);
console.log('row sample columns:', data && data[0] ? Object.keys(data[0]) : '(table empty)');
const { error: e2 } = await supabase.from('sub_agent_execution_results').insert({}).select('*').single();
console.log('empty-insert error (reveals required cols):', e2);
