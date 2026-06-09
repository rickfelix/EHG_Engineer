/**
 * SD-FDBK-FIX-CLAIM-RPC-VALIDATE-001 — claim_sd must reject non-existent ids.
 *
 * claim_sd was OPTIMISTIC: calling it with a non-existent id (SD-FAKE-PROBE-000 /
 * QF-00000000-000) returned {success:true} and wrote claude_sessions.sd_key, silently
 * self-claiming a phantom. The fix adds an existence guard (SDs by sd_key, QFs by
 * quick_fixes.id) that returns {success:false, error:'sd_not_found'} for phantom ids —
 * while leaving real claims (and the takeover/QF/cross-table logic) unchanged.
 *
 * Live-DB integration test, gated like the other tests/database suites so CI skips
 * cleanly without service-role creds.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

const PROBE_SESSION = 'test-claim-validate-exists-session';

describe.skipIf(!HAS_REAL_DB)('claim_sd rejects non-existent ids (SD-FDBK-FIX-CLAIM-RPC-VALIDATE-001)', () => {
  afterAll(async () => {
    await supabase.from('claude_sessions').update({ sd_key: null }).eq('session_id', PROBE_SESSION);
  });

  it('returns sd_not_found for a non-existent SD id (no phantom self-claim)', async () => {
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: 'SD-FAKE-PROBE-000', p_session_id: PROBE_SESSION, p_track: null });
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('sd_not_found');
    // and it must NOT have written the phantom key onto the session
    const { data: sess } = await supabase.from('claude_sessions').select('sd_key').eq('session_id', PROBE_SESSION).maybeSingle();
    expect(sess?.sd_key ?? null).not.toBe('SD-FAKE-PROBE-000');
  });

  it('returns sd_not_found for a non-existent QF id', async () => {
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: 'QF-00000000-000', p_session_id: PROBE_SESSION, p_track: null });
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('sd_not_found');
  });

  it('still claims a real unclaimed SD (existence guard does not break the happy path)', async () => {
    const { data: cand } = await supabase.from('strategic_directives_v2')
      .select('sd_key, claiming_session_id, active_session_id, is_working_on')
      .is('claiming_session_id', null).in('status', ['draft', 'active']).limit(1);
    if (!cand || !cand[0]) return; // no unclaimed SD available — environment-dependent, skip assertion
    const key = cand[0].sd_key;
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: key, p_session_id: PROBE_SESSION, p_track: null });
    expect(data?.success).toBe(true);
    // restore (net-zero)
    await supabase.from('strategic_directives_v2').update({
      claiming_session_id: cand[0].claiming_session_id,
      active_session_id: cand[0].active_session_id,
      is_working_on: cand[0].is_working_on,
    }).eq('sd_key', key);
    await supabase.from('claude_sessions').update({ sd_key: null }).eq('session_id', PROBE_SESSION);
  });
});
