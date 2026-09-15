import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD='SD-LEARN-FIX-ADDRESS-PAT-LES-015';
const { data: sd } = await sb.from('strategic_directives_v2').select('id, sd_key, sd_type, status, current_phase, target_application').or(`sd_key.eq.${SD},id.eq.${SD}`);
console.log('SD ROW:', JSON.stringify(sd, null, 1));
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, handoff_type, status, verdict, confidence_score, created_at, sd_id, metadata')
  .or(`sd_id.eq.${SD}`).order('created_at', { ascending: false }).range(0, 19);
console.log('ERR:', error?.message||'none');
for (const r of (data||[])) {
  console.log(`- ${r.sub_agent_code} | ${r.phase} | ${r.handoff_type} | ${r.status} | ${r.verdict} | ${r.confidence_score} | ${r.created_at}`);
  console.log('    meta keys:', Object.keys(r.metadata||{}).join(','));
}
