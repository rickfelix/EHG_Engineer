import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { bestEffortReleaseSdByKey } from '../lib/fleet/best-effort-release.mjs';
const supabase = createSupabaseServiceClient();
const r = await bestEffortReleaseSdByKey(supabase, process.env.CLAUDE_SESSION_ID, 'SD-LEO-FIX-WIRE-SEVEN-RETROSPECTIVE-001', 'coordinator_decision_A_resume_final_handoff');
console.log('RELEASE:', JSON.stringify(r));
const { data: sd } = await supabase.from('strategic_directives_v2').select('status,current_phase,claiming_session_id,is_working_on').eq('sd_key', 'SD-LEO-FIX-WIRE-SEVEN-RETROSPECTIVE-001').maybeSingle();
console.log('SD AFTER:', JSON.stringify(sd));
