import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_UUID = 'a281d3a9-c69a-456c-b514-2de7790ea6a7';
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id,sub_agent_code,verdict,confidence,phase,source,created_at,metadata')
  .eq('sd_id', SD_UUID).order('created_at',{ascending:false});
console.log('error:', error?error.message:'none', '| rows for this SD:', data?.length);
(data||[]).forEach(r=>console.log(` ${r.sub_agent_code} | ${r.verdict} | conf ${r.confidence} | phase ${r.phase} | source ${r.source} | ${r.created_at}`));
const row = (data||[])[0];
console.log('\n-- repo provenance on newest row --');
console.log(' metadata.repo_path      :', row?.metadata?.repo_path);
console.log(' metadata.executed_from_cwd:', row?.metadata?.executed_from_cwd);
console.log(' repo_resolved           :', row?.metadata?.repo_resolved);
console.log(' leak check (equal?)     :', row?.metadata?.repo_path === row?.metadata?.executed_from_cwd ? 'EQUAL (would flag)' : 'DIFFERENT (ok)');

const { data: app } = await sb.from('applications').select('name,local_path').ilike('name','%EHG_Engineer%');
console.log('\napplications.local_path:', JSON.stringify(app));

const { data: v, error: ev } = await sb.from('v_sub_agent_repo_compliance').select('*').eq('sd_id', SD_UUID).limit(5);
console.log('\nv_sub_agent_repo_compliance:', ev? 'ERR '+ev.code+' '+ev.message.slice(0,80) : JSON.stringify(v));

const { data: sd } = await sb.from('strategic_directives_v2').select('created_at,current_phase,status').eq('id',SD_UUID).maybeSingle();
console.log('\nSD created_at (phase-start anchor for LEAD):', sd?.created_at, '| phase:', sd?.current_phase, '| status:', sd?.status);
console.log('evidence newer than phase start?', new Date(row.created_at) >= new Date(sd.created_at) ? 'YES (fresh)' : 'NO');
