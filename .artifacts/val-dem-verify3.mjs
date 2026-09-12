import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results').select('*').eq('sd_id','4520716b-0603-46b5-bf7e-19fe4271fe3b').order('created_at');
for (const r of data||[]) console.log(`${r.created_at} | ${r.sub_agent_code.padEnd(11)} | ${r.verdict.padEnd(17)} | phase=${r.phase} | repo_path=${JSON.stringify(r.metadata?.repo_path)} repo_resolved=${r.metadata?.repo_resolved} | ${r.id}`);
