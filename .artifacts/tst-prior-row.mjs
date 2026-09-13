import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results').select('*').eq('id','51dde124-d736-4ace-a9eb-90264145515a').single();
if(error){console.error(JSON.stringify(error));process.exit(1);}
for(const [k,v] of Object.entries(data)){const s=v===null?'NULL':(typeof v==='string'?v:JSON.stringify(v));console.log(k,'::',s.length>200?s.slice(0,200)+'...['+s.length+']':s);}
