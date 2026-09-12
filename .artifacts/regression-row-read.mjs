import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD='3f128d5c-8168-4415-86cc-ab5da4663d11';
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('*').eq('sub_agent_code','REGRESSION').eq('sd_id',SD)
  .order('created_at',{ascending:false}).limit(3);
if(error){console.log('SELECT_ERR',error.message);process.exit(1);}
console.log('rows found:', data.length);
for(const r of data) console.log(' ', r.id, '|', r.verdict, r.confidence, '|', r.phase, '|', r.created_at, '| repo_path=', r.metadata?.repo_path, '| cwd=', r.metadata?.executed_from_cwd, '| session=', r.session_id, '| sha=', r.evaluated_commit_sha);
console.log('COLUMNS:', Object.keys(data[0]||{}).join(','));
