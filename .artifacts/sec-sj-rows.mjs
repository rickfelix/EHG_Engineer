import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: rows, error } = await sb.from('sub_agent_execution_results')
  .select('*').eq('sd_id','6b090e53-3732-43e9-9f07-939bae2a0f69').order('created_at',{ascending:false}).limit(5);
if (error) console.log('ERR', error.message);
console.log('count:', rows?.length);
if (rows?.[0]) console.log('COLUMNS:', Object.keys(rows[0]).join(', '));
for (const r of rows||[]) console.log(' -', r.created_at, r.sub_agent_code, r.phase, r.verdict, r.source, 'repo=', r.metadata?.repo_path);
