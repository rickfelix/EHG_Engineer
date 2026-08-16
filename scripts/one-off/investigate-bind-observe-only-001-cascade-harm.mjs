// Investigation script (SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001): VALIDATION's
// PLAN_VERIFICATION report found BIND-OBSERVE-ONLY-001 has 7 rejected sd_phase_handoffs
// rows, 4 written during this SD's own EXEC window (2026-08-15T15:49 - 2026-08-16T02:46).
// Read-only investigation to confirm whether this is the SAME bug this SD fixes.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: sd, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, title, status, current_phase, metadata, claiming_session_id, priority')
  .eq('sd_key', 'SD-LEO-INFRA-BIND-OBSERVE-ONLY-001')
  .maybeSingle();

if (sdErr) { console.log('SD_FETCH_ERROR', sdErr.message); process.exit(1); }
if (!sd) { console.log('SD_NOT_FOUND by sd_key=BIND-OBSERVE-ONLY-001'); process.exit(0); }

console.log('SD:', JSON.stringify(sd, null, 2));

const { data: handoffs, error: hErr } = await supabase
  .from('sd_phase_handoffs')
  .select('id, sd_id, handoff_type, status, created_at, rejection_reason, metadata')
  .eq('sd_id', sd.id)
  .order('created_at', { ascending: false });

if (hErr) { console.log('HANDOFF_FETCH_ERROR', hErr.message); process.exit(1); }

console.log('\nHANDOFF ROWS:', handoffs.length);
for (const h of handoffs) {
  console.log('---');
  console.log('created_at:', h.created_at);
  console.log('type:', h.handoff_type, 'status:', h.status);
  console.log('rejection_reason:', h.rejection_reason);
  console.log('metadata:', JSON.stringify(h.metadata)?.slice(0, 500));
}
