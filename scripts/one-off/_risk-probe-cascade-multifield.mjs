// Multi-field UPDATE probe — closer to what handoff.js does (sets status, current_phase, progress_percentage).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001';

const before = await sb.from('strategic_directives_v2')
  .select('id, sd_key, claiming_session_id, is_working_on, active_session_id, status, current_phase, progress_percentage, metadata')
  .eq('sd_key', SD_KEY).single();
console.log('BEFORE multifield:', JSON.stringify({
  claiming_session_id: before.data.claiming_session_id,
  is_working_on: before.data.is_working_on,
  active_session_id: before.data.active_session_id,
  status: before.data.status,
  current_phase: before.data.current_phase,
  progress_percentage: before.data.progress_percentage
}, null, 2));

// Simulate handoff-style multi-field write (NOT changing status — preserve current values)
const upd = await sb.from('strategic_directives_v2')
  .update({
    status: before.data.status,
    current_phase: before.data.current_phase,
    progress_percentage: before.data.progress_percentage,
    metadata: { ...(before.data.metadata || {}), risk_probe_marker: new Date().toISOString() }
  })
  .eq('sd_key', SD_KEY)
  .select('id, sd_key, claiming_session_id, is_working_on, active_session_id')
  .single();
console.log('AFTER multifield:', JSON.stringify({
  claiming_session_id: upd.data?.claiming_session_id,
  is_working_on: upd.data?.is_working_on,
  active_session_id: upd.data?.active_session_id,
  error: upd.error?.message
}, null, 2));

console.log('\n[RISK-PROBE-MULTIFIELD-RESULT]', JSON.stringify({
  before_claim_state: !!(before.data.claiming_session_id && before.data.is_working_on && before.data.active_session_id),
  after_claim_state: !!(upd.data?.claiming_session_id && upd.data?.is_working_on && upd.data?.active_session_id),
  cascade_overreach_reproduced: (before.data.claiming_session_id && !upd.data?.claiming_session_id) ||
                                 (before.data.is_working_on && !upd.data?.is_working_on) ||
                                 (before.data.active_session_id && !upd.data?.active_session_id)
}, null, 2));
