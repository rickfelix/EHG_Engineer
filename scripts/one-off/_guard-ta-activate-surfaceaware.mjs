// Guard: ensure target_application stays EHG_Engineer before a handoff (auto-classifier flips it on marketing vocab).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-ACTIVATE-SURFACEAWARE-WIREFRAME-PIPELINE-ORCH-001';
const { data: b } = await supabase.from('strategic_directives_v2').select('target_application, current_phase, status, claiming_session_id').eq('sd_key', KEY).single();
if (b.target_application !== 'EHG_Engineer') {
  await supabase.from('strategic_directives_v2').update({ target_application: 'EHG_Engineer' }).eq('sd_key', KEY);
  console.log('GUARD: CORRECTED target_application ' + b.target_application + ' -> EHG_Engineer');
} else {
  console.log('GUARD: target_application OK=EHG_Engineer | phase=' + b.current_phase + ' | status=' + b.status + ' | claim=' + String(b.claiming_session_id || '').slice(0, 8));
}
