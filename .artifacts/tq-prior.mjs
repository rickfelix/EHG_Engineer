import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results').select('*').eq('sd_id','fbbf9a6d-e079-4c22-9189-88336aae9a16').eq('sub_agent_code','TESTING').order('created_at',{ascending:false}).limit(1);
if (error){console.error(error);process.exit(1);}
const r=data[0];
console.log('COLUMNS:', Object.keys(r).join(', '));
console.log('\nSAMPLE (truncated values):');
for (const [k,v] of Object.entries(r)){
  const s = v===null?'null':(typeof v==='string'?v:JSON.stringify(v));
  console.log(' ', k, '=', s.length>220? s.slice(0,220)+' …['+s.length+']' : s);
}
