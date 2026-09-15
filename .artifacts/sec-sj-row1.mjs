import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: r } = await sb.from('sub_agent_execution_results').select('*').eq('id','9659e04f-2845-46b3-85e4-ee793bab71cb').single();
console.log('verdict:', r.verdict, '| phase:', r.phase, '| source:', r.source, '| conf:', r.confidence);
console.log('repo_path:', r.metadata?.repo_path, '| executed_from_cwd(meta):', r.metadata?.executed_from_cwd, '| col:', r.executed_from_cwd);
console.log('critical_issues:', JSON.stringify(r.critical_issues));
console.log('warnings:', JSON.stringify(r.warnings)?.slice(0,900));
console.log('summary:', String(r.summary||'').slice(0,500));
