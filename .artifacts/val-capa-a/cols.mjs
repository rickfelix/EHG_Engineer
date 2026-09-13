import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('venture_quality_findings').select('*').limit(1);
console.log('err', error?.message);
console.log('COLUMNS:', data && data[0] ? Object.keys(data[0]).join(', ') : '(no rows - using head probe)');
const { count } = await sb.from('venture_quality_findings').select('*',{count:'exact',head:true});
console.log('total rows:', count);
