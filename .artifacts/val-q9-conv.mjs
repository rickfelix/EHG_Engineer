import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results')
  .select('sub_agent_code,verdict,phase,validation_mode,confidence,created_at,metadata')
  .eq('sub_agent_code','VALIDATION').order('created_at',{ascending:false}).limit(12);
for (const r of (data||[])) console.log(`${r.created_at.slice(0,19)} | ${r.verdict} | phase=${JSON.stringify(r.phase)} | mode=${JSON.stringify(r.validation_mode)} | conf=${r.confidence} | repo=${r.metadata?.repo_path||'-'}`);
