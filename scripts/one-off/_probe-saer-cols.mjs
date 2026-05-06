import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env', quiet: true });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const r = await sb.from('sub_agent_execution_results').select('*').limit(1);
console.log('cols:', r.data && r.data[0] ? Object.keys(r.data[0]) : '(empty)');
