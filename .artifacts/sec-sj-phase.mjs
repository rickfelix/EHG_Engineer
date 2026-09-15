import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: sd, error } = await sb.from('strategic_directives_v2')
  .select('id, sd_key, title, status, current_phase, progress')
  .eq('sd_key','SD-LEO-INFRA-FIX-STAGE-JOURNEY-001').maybeSingle();
console.log('SD:', JSON.stringify(sd,null,2), error?.message||'');
const { data: rows, error: e2 } = await sb.from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, status, verdict, created_at, source')
  .eq('sd_id', sd?.id).order('created_at',{ascending:false}).limit(15);
if (e2) console.log('ERR', e2.message);
console.log('recent evidence rows:'); for (const r of rows||[]) console.log(' ', r.created_at, r.sub_agent_code, r.phase, r.status, JSON.stringify(r.verdict)?.slice(0,60), r.source);
