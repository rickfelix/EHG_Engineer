// SD-LEO-INFRA-CLAIM-SURFACE-SYNC-001 / FR-2: one-time sweep of the live stale
// claim on SD-LEO-GEN-ALTIFYAI-FIRST-CUSTOMER-001, via the existing
// dual-surface releaseClaimBothSurfaces() helper -- not a hand-rolled clear.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { releaseClaimBothSurfaces } from '../../lib/claim/release-claim-both-surfaces.mjs';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-GEN-ALTIFYAI-FIRST-CUSTOMER-001';

const { data: before, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('sd_key, claiming_session_id, active_session_id, is_working_on, status, current_phase')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error(readErr); process.exit(1); }
console.log('BEFORE:', JSON.stringify(before));

if (!before.claiming_session_id) {
  console.log('Already clear -- no-op (state changed since PLAN, nothing to sweep).');
  process.exit(0);
}

const { data: session } = await supabase
  .from('claude_sessions')
  .select('session_id, sd_key, status, heartbeat_at')
  .eq('session_id', before.claiming_session_id)
  .maybeSingle();
console.log('HOLDER SESSION:', JSON.stringify(session));

if (session && session.sd_key === SD_KEY) {
  console.log('REFUSING: the holder session has since legitimately re-claimed this SD (sd_key matches) -- not stale, do not sweep.');
  process.exit(1);
}

const result = await releaseClaimBothSurfaces(supabase, {
  sdKey: SD_KEY,
  reason: 'SD-LEO-INFRA-CLAIM-SURFACE-SYNC-001-sweep',
  sessionStatus: 'idle', // the holder session is alive/idle -- do not retire it, just unclaim this row
  tryRpc: false, // this is a pure SD-side stale-claim clear; the session side is already null/idle
  readback: true,
});
console.log('SWEEP RESULT:', JSON.stringify(result, null, 2));

const { data: after } = await supabase
  .from('strategic_directives_v2')
  .select('sd_key, claiming_session_id, active_session_id, is_working_on')
  .eq('sd_key', SD_KEY)
  .single();
console.log('AFTER:', JSON.stringify(after));

if (after.claiming_session_id !== null) {
  console.error('SWEEP FAILED: claiming_session_id still non-null after the sweep.');
  process.exit(1);
}
console.log('Sweep verified: claiming_session_id is NULL.');
