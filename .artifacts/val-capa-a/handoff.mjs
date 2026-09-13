import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD='SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A';
const { data: sd } = await sb.from('strategic_directives_v2').select('id,uuid_id,sd_key,status,current_phase,progress').or(`id.eq.${SD},sd_key.eq.${SD}`);
console.log('SD:', JSON.stringify(sd));
const { data: h, error: he } = await sb.from('sd_phase_handoffs').select('from_phase,to_phase,status,created_at,deliverables_manifest,verification_results').or(`sd_id.eq.${SD},sd_key.eq.${SD}`).order('created_at',{ascending:false}).limit(3);
if (he) console.log('handoff err', he.message);
for (const r of (h||[])) {
  console.log(`\n--- ${r.from_phase} -> ${r.to_phase} (${r.status}) ${r.created_at}`);
  console.log('DELIVERABLES:', JSON.stringify(r.deliverables_manifest).slice(0,2500));
}
const { data: sub } = await sb.from('sub_agent_execution_results').select('sub_agent_code,verdict,phase,created_at').or(`sd_id.eq.${SD},sd_key.eq.${SD}`).order('created_at',{ascending:false}).limit(25);
console.log('\n--- SUB-AGENT RESULTS ---');
for (const r of (sub||[])) console.log(`  ${r.created_at} ${String(r.phase).padEnd(20)} ${String(r.sub_agent_code).padEnd(12)} ${r.verdict}`);
