import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: sd, error } = await sb.from('strategic_directives_v2').select('*').eq('id','3f128d5c-8168-4415-86cc-ab5da4663d11').single();
if (error) { console.error('ERR', error.message); process.exit(1); }
console.log('SD:', sd.sd_key, '| status', sd.status, '| phase', sd.current_phase, '| prio', sd.priority, '| prog', sd.progress, '| app', sd.target_application);
console.log('TITLE:', sd.title);
console.log('--- DESCRIPTION ---'); console.log(sd.description || '(null)');
console.log('--- SCOPE ---'); console.log(sd.scope || '(null)');
console.log('--- METADATA KEYS ---', Object.keys(sd.metadata||{}).join(','));
const { data: bl } = await sb.from('sd_backlog_map').select('*').eq('sd_id', sd.id);
console.log('BACKLOG COUNT:', (bl||[]).length);
for (const b of bl||[]) console.log('  -', b.backlog_id, '|', b.priority, '|', b.backlog_title);
const { data: prd } = await sb.from('product_requirements_v2').select('id,title,status').eq('directive_id', sd.sd_key);
console.log('PRD COUNT:', (prd||[]).length, JSON.stringify(prd));
const { data: sar } = await sb.from('sub_agent_execution_results').select('sub_agent_code,phase,verdict,created_at').eq('sd_id', sd.id).order('created_at');
console.log('SUBAGENT ROWS:', (sar||[]).length, (sar||[]).map(r=>`${r.sub_agent_code}/${r.phase}/${r.verdict}`).join(' '));
