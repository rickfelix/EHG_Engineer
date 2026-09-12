import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from('sub_agent_execution_results').select('phase, sub_agent_code').not('phase','is',null).order('created_at',{ascending:false}).limit(400);
const c = {}; for (const r of data||[]) c[r.phase]=(c[r.phase]||0)+1;
console.log('PHASE VALUES (last 400):', JSON.stringify(c));
const { data: mine } = await s.from('sub_agent_execution_results').select('id,sub_agent_code,phase,verdict,created_at').eq('sd_id','4520716b-0603-46b5-bf7e-19fe4271fe3b').order('created_at');
console.log('\nTHIS SD rows:');
for (const r of mine||[]) console.log(' ', r.created_at, r.sub_agent_code, '| phase:', r.phase, '| verdict:', r.verdict, '|', r.id);
// FR-7 waiver search
const { data: cd } = await s.from('chairman_decisions').select('id,decision_type,created_at,rationale,decision').ilike('rationale','%HIGH_CONSEQUENCE%').limit(5);
console.log('\nWaiver rows (chairman_decisions ilike HIGH_CONSEQUENCE):', cd?.length ?? 0);
