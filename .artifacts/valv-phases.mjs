import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results').select('phase').limit(3000);
const c = {}; for (const r of data||[]) c[r.phase] = (c[r.phase]||0)+1;
console.log('phase values:', JSON.stringify(c, null, 1));
const { data: mine } = await sb.from('sub_agent_execution_results').select('id, sub_agent_code, phase, verdict, confidence, created_at').eq('sd_id','fbbf9a6d-e079-4c22-9189-88336aae9a16').order('created_at');
console.log('\nSD rows:'); for (const r of mine||[]) console.log(' ', r.created_at, r.sub_agent_code.padEnd(12), r.phase.padEnd(18), r.verdict, r.confidence, r.id.slice(0,8));
