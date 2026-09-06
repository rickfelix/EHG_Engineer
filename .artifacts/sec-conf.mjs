import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results').select('*').eq('id','5f31b9b9-acb6-4a17-884b-5ac25b07c6bb').single();
console.log(Object.keys(data).filter(k=>/conf/i.test(k)).map(k=>k+'='+JSON.stringify(data[k])).join('\n') || '(no confidence-like column)');
console.log('metadata conf keys:', Object.keys(data.metadata||{}).filter(k=>/conf/i.test(k)).map(k=>k+'='+JSON.stringify(data.metadata[k])).join(', ') || '(none)');
