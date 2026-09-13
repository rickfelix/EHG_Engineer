import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('sub_agent_execution_results').select('*').eq('id','cf40b474-85f4-496e-9e87-0755c39328b1').single();
if (error) { console.log('ERR', error.message); process.exit(1); }
const shape = {};
for (const [k,v] of Object.entries(data)) shape[k] = v === null ? null : (typeof v === 'object' ? (Array.isArray(v)? `ARRAY[${v.length}]` : `OBJ{${Object.keys(v).slice(0,12).join(',')}}`) : (typeof v === 'string' ? v.slice(0,90) : v));
console.log(JSON.stringify(shape,null,2));
