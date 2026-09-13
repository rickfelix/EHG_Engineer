import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results').select('*')
  .eq('id','c605ec77-86b0-4e83-8169-f024b0636eeb').maybeSingle();
if (error) { console.error('ERR', error.message); process.exit(1); }
if (!data) { console.error('ROW NOT FOUND - NOT PERSISTED'); process.exit(1); }
const m = data.metadata||{};
console.log('READ-BACK OK');
console.log('id                  :', data.id);
console.log('sd_id               :', data.sd_id);
console.log('sub_agent_code      :', data.sub_agent_code);
console.log('phase (column)      :', data.phase);
console.log('verdict             :', data.verdict);
console.log('confidence          :', data.confidence);
console.log('source              :', data.source);
console.log('created_at          :', data.created_at);
console.log('executed_from_cwd(col):', data.executed_from_cwd);
console.log('--- metadata (gate-read fields) ---');
console.log('metadata.repo_path        :', m.repo_path);
console.log('metadata.executed_from_cwd:', m.executed_from_cwd);
console.log('metadata.repo_resolved    :', JSON.stringify(m.repo_resolved));
console.log('metadata.phase            :', m.phase);
console.log('concerns present          :', Object.keys(m.concerns_assessed||{}).join(', '));
console.log('concern verdicts          :', Object.entries(m.concerns_assessed||{}).map(([k,v])=>k.split('_')[0]+'='+v.verdict.split(' ')[0]).join(' '));
console.log('warnings                  :', (data.warnings||[]).length, '| critical_issues:', (data.critical_issues||[]).length);
console.log('severities                :', (data.warnings||[]).map(w=>w.severity).join(', '));
// gate view check
const { data: v, error: ve } = await sb.from('v_sub_agent_repo_compliance').select('*').eq('id', data.id).maybeSingle();
console.log('--- SUB_AGENT_REPO_RESOLUTION gate view ---');
console.log(ve ? ('view err: '+ve.message) : JSON.stringify(v));
