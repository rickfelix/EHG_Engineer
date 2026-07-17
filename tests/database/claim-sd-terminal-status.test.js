/**
 * SD-LEO-FIX-CLAIM-RPC-TERMINAL-001 — claim_sd must reject claiming terminal-status items.
 *
 * The predecessor SD-FDBK-FIX-CLAIM-RPC-VALIDATE-001 added the sd_not_found existence guard,
 * but claim_sd still optimistically claimed an SD/QF whose lifecycle had ended, stomping
 * claiming_session_id. This guard returns {success:false, error:'sd_terminal_status', status}
 * BEFORE any write for terminal SDs (completed/cancelled/deferred) and terminal QFs
 * (completed/cancelled/escalated) — while leaving real claims and the existence guard intact.
 *
 * SD-LEO-INFRA-BLOCK-TEST-SESSION-001: claim_sd now ALSO rejects any caller session_id with
 * no live claude_sessions row (a PHANTOM caller), fired before this suite's own terminal-status
 * and sd_not_found guards. PROBE_SESSION must therefore be a real registered session for every
 * assertion in this file, not just the happy-path claim.
 *
 * Live-DB integration test, gated like the other tests/database suites so CI skips cleanly
 * without service-role creds. The guard fires before any UPDATE, so the terminal probes are
 * inherently net-zero (asserted explicitly).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

const PROBE_SESSION = 'test-claim-terminal-status-session';

async function firstSdWithStatus(status) {
  const { data } = await supabase.from('strategic_directives_v2')
    .select('sd_key, claiming_session_id').eq('status', status).limit(1);
  return data && data[0] ? data[0] : null;
}

describe.skipIf(!HAS_REAL_DB)('claim_sd rejects terminal-status items (SD-LEO-FIX-CLAIM-RPC-TERMINAL-001)', () => {
  beforeAll(async () => {
    await supabase.from('claude_sessions').upsert({
      session_id: PROBE_SESSION,
      status: 'idle',
      heartbeat_at: new Date().toISOString(),
      machine_id: 'test-machine',
      terminal_id: `test-${PROBE_SESSION}`,
      hostname: 'test-host',
      codebase: 'EHG_Engineer',
      sd_key: null,
    }, { onConflict: 'session_id' });
  });

  afterAll(async () => {
    await supabase.from('claude_sessions').delete().eq('session_id', PROBE_SESSION);
  });

  it('rejects a completed SD with sd_terminal_status and does NOT stomp claiming_session_id', async () => {
    const sd = await firstSdWithStatus('completed');
    if (!sd) return; // env-dependent
    const before = sd.claiming_session_id ?? null;
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: sd.sd_key, p_session_id: PROBE_SESSION, p_track: null });
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('sd_terminal_status');
    expect(data?.status).toBe('completed');
    // net-zero: claiming_session_id unchanged (guard fired before any write)
    const { data: after } = await supabase.from('strategic_directives_v2')
      .select('claiming_session_id').eq('sd_key', sd.sd_key).maybeSingle();
    expect(after?.claiming_session_id ?? null).toBe(before);
    // and the probe session must NOT have acquired the key
    const { data: sess } = await supabase.from('claude_sessions').select('sd_key').eq('session_id', PROBE_SESSION).maybeSingle();
    expect(sess?.sd_key ?? null).not.toBe(sd.sd_key);
  });

  it('rejects a cancelled SD with clean sd_terminal_status JSON (not trigger-393 raw P0001)', async () => {
    const sd = await firstSdWithStatus('cancelled');
    if (!sd) return;
    const { data, error } = await supabase.rpc('claim_sd', { p_sd_id: sd.sd_key, p_session_id: PROBE_SESSION, p_track: null });
    // The guard returns structured JSON BEFORE the UPDATE, so trigger 393 never raises.
    expect(error).toBeNull();
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('sd_terminal_status');
    expect(data?.status).toBe('cancelled');
  });

  it('rejects a deferred SD with sd_terminal_status (skipped if none exist)', async () => {
    const sd = await firstSdWithStatus('deferred');
    if (!sd) return;
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: sd.sd_key, p_session_id: PROBE_SESSION, p_track: null });
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('sd_terminal_status');
    expect(data?.status).toBe('deferred');
  });

  it('rejects an escalated quick-fix with sd_terminal_status (skipped if none exist)', async () => {
    const { data: qf } = await supabase.from('quick_fixes').select('id').eq('status', 'escalated').limit(1);
    if (!qf || !qf[0]) return;
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: qf[0].id, p_session_id: PROBE_SESSION, p_track: null });
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('sd_terminal_status');
    expect(data?.status).toBe('escalated');
  });

  it('still claims a real unclaimed draft/active SD (terminal guard does not break the happy path)', async () => {
    const { data: cand } = await supabase.from('strategic_directives_v2')
      .select('sd_key, claiming_session_id, active_session_id, is_working_on')
      .is('claiming_session_id', null).in('status', ['draft', 'active']).limit(1);
    if (!cand || !cand[0]) return; // env-dependent
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

  it('still returns sd_not_found for a non-existent id (existence guard non-regression)', async () => {
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: 'SD-FAKE-PROBE-000', p_session_id: PROBE_SESSION, p_track: null });
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('sd_not_found');
  });
});
