import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results').select('*').eq('sub_agent_code','REGRESSION').order('created_at',{ascending:false}).limit(1);
if (error) { console.error('ERR', JSON.stringify(error)); process.exit(1); }
console.log('COLUMNS:', Object.keys(data[0]||{}).join(', '));
console.log('SAMPLE:', JSON.stringify(data[0]).slice(0,1200));
