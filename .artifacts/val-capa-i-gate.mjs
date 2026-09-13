import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('v_sub_agent_repo_compliance').select('*').eq('id','19dfb4fb-b0e4-402e-8cdb-cbe2a36057a6');
console.log(error ? 'view ERR: '+error.message : JSON.stringify(data,null,1));
