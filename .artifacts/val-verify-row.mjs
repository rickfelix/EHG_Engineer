import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results').select('*').eq('id','457a403c-0517-4bc6-8805-42ee438f5df0').maybeSingle();
if (error) { console.log('ERR', error.message); process.exit(1); }
console.log('code=', data.sub_agent_code, '| phase=', data.phase, '| verdict=', data.verdict, '| conf=', data.confidence ?? data.confidence_score);
console.log('metadata.repo_path      =', data.metadata?.repo_path);
console.log('metadata.repo_resolved  =', data.metadata?.repo_resolved);
console.log('metadata.executed_from_cwd =', data.metadata?.executed_from_cwd);
console.log('top-level repo_path col exists? ', Object.prototype.hasOwnProperty.call(data,'repo_path'));
console.log('findings count =', Array.isArray(data.findings) ? data.findings.length : typeof data.findings);
const { data: app } = await sb.from('applications').select('local_path').eq('name','EHG_Engineer').maybeSingle();
console.log('applications.local_path =', app?.local_path, '| EXACT MATCH =', app?.local_path === data.metadata?.repo_path);
