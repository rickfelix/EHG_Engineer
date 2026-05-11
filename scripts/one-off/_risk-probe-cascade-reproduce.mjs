// Risk-agent LEAD-phase empirical probe: try to reproduce cascade-trigger overreach.
// We perform a benign UPDATE on strategic_directives_v2 (e.g., set updated_at = NOW())
// for the probe SD itself and observe whether claim cols get cleared.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001';

const before = await sb.from('strategic_directives_v2')
  .select('id, sd_key, claiming_session_id, is_working_on, active_session_id')
  .eq('sd_key', SD_KEY).single();
console.log('BEFORE:', JSON.stringify(before.data, null, 2));

// Benign update: touch only `description` field — same row, no claim col in SET clause.
const upd = await sb.from('strategic_directives_v2')
  .update({ description: before.data.description ?? 'risk-agent probe touch' })
  .eq('sd_key', SD_KEY)
  .select('id, sd_key, claiming_session_id, is_working_on, active_session_id')
  .single();
console.log('AFTER benign update:', JSON.stringify(upd.data, null, 2));

const cleared_claiming = before.data.claiming_session_id && !upd.data?.claiming_session_id;
const cleared_working = before.data.is_working_on && !upd.data?.is_working_on;
const cleared_active = before.data.active_session_id && !upd.data?.active_session_id;

console.log('\n[RISK-PROBE-RESULT]', JSON.stringify({
  claim_cols_cleared_by_benign_update: { cleared_claiming, cleared_working, cleared_active },
  hypothesis_cascade_trigger_overreach_confirmed: cleared_claiming || cleared_working || cleared_active
}, null, 2));
