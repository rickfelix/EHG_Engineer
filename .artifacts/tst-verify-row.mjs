import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from('sub_agent_execution_results')
  .select('id, sub_agent_code, verdict, phase, created_at, confidence_score, repo_path:metadata->>repo_path, executed_from_cwd:metadata->>executed_from_cwd, repo_resolved:metadata->>repo_resolved')
  .eq('sd_id','aaf65001-7031-46aa-882f-9f51281dc572').eq('sub_agent_code','TESTING')
  .order('created_at',{ascending:false}).limit(3);
console.log(JSON.stringify(data,null,2));
const { data: app } = await s.from('applications').select('local_path').eq('app_name','EHG_Engineer').maybeSingle();
console.log('applications.local_path:', app?.local_path);
