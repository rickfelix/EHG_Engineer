/**
 * SD-LEO-FIX-SWITCH-CLAIM-RPC-001 — switch_sd_claim must reject phantom / terminal NEW targets.
 *
 * switch_sd_claim took a free-form p_new_sd_id like claim_sd but had NO existence guard and
 * NO terminal-status guard. Its SD-side UPDATE keyed WHERE sd_key=p_new_sd_id with no NOT FOUND
 * check (a phantom/typo id matched zero SD rows, yet the claude_sessions UPDATE still wrote
 * sd_key=p_new_sd_id — a phantom self-switch), and no terminal check (a claim could be switched
 * onto a completed/cancelled/deferred SD). The fix mirrors the sibling claim_sd guards
 * (SD-FDBK-FIX-CLAIM-RPC-VALIDATE-001 existence + SD-LEO-FIX-CLAIM-RPC-TERMINAL-001 terminal):
 * the existence (sd_not_found) and terminal (sd_terminal_status) guards fire BEFORE any UPDATE,
 * so the phantom/terminal probes are inherently net-zero (asserted explicitly).
 *
 * Live-DB integration test, gated like the other tests/database suites so CI skips cleanly
 * without service-role creds. Net-zero: the probe session row is inserted in beforeAll and
 * hard-deleted in afterAll; the only real-SD writes (the valid happy-path switch) are restored
 * to their captured pre-state.
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

const PROBE_SESSION = 'test-switch-claim-guards-session';
// A fixed phantom key the probe session "holds" as its old claim. switch_sd_claim only reads
// claude_sessions for the old side (the old-side UPDATE is a no-op WHERE clause for this key),
// so using a phantom old id keeps the old side net-zero without touching any real SD.
const OLD_PHANTOM = 'SD-SWITCH-OLD-PROBE-000';

async function firstSdWithStatus(status) {
  const { data } = await supabase.from('strategic_directives_v2')
    .select('sd_key').eq('status', status).limit(1);
  return data && data[0] ? data[0].sd_key : null;
}

describe.skipIf(!HAS_REAL_DB)('switch_sd_claim rejects phantom/terminal NEW targets (SD-LEO-FIX-SWITCH-CLAIM-RPC-001)', () => {
  beforeAll(async () => {
    // Insert a dedicated probe session already holding the (phantom) old claim, status=active.
    await supabase.from('claude_sessions').delete().eq('session_id', PROBE_SESSION);
    await supabase.from('claude_sessions').insert({
      session_id: PROBE_SESSION,
      sd_key: OLD_PHANTOM,
      status: 'active',
      track: 'C',
    });
  });

  afterAll(async () => {
    // Hard-delete the probe session row → net-zero (we created it).
    await supabase.from('claude_sessions').delete().eq('session_id', PROBE_SESSION);
  });

  async function switchTo(newId) {
    return supabase.rpc('switch_sd_claim', {
      p_session_id: PROBE_SESSION,
      p_old_sd_id: OLD_PHANTOM,
      p_new_sd_id: newId,
      p_new_track: null,
    });
  }

  it('returns sd_not_found for a phantom NEW SD id and does NOT write sd_key onto the session', async () => {
    const { data, error } = await switchTo('SD-FAKE-SWITCH-TARGET-000');
    expect(error).toBeNull();
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('sd_not_found');
    // CRITICAL: the phantom-self-switch bug — session.sd_key must still be the OLD claim, never the phantom NEW id.
    const { data: sess } = await supabase.from('claude_sessions')
      .select('sd_key').eq('session_id', PROBE_SESSION).maybeSingle();
    expect(sess?.sd_key).toBe(OLD_PHANTOM);
    expect(sess?.sd_key).not.toBe('SD-FAKE-SWITCH-TARGET-000');
  });

  it('returns sd_not_found for a phantom NEW QF id', async () => {
    const { data, error } = await switchTo('QF-00000000-switch');
    expect(error).toBeNull();
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('sd_not_found');
    const { data: sess } = await supabase.from('claude_sessions')
      .select('sd_key').eq('session_id', PROBE_SESSION).maybeSingle();
    expect(sess?.sd_key).toBe(OLD_PHANTOM);
  });

  it('rejects a completed NEW SD with sd_terminal_status and does NOT switch the claim', async () => {
    const key = await firstSdWithStatus('completed');
    if (!key) return; // env-dependent
    // capture target claim state to prove net-zero
    const { data: before } = await supabase.from('strategic_directives_v2')
      .select('claiming_session_id, active_session_id, is_working_on').eq('sd_key', key).maybeSingle();
    const { data, error } = await switchTo(key);
    expect(error).toBeNull();
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('sd_terminal_status');
    expect(data?.status).toBe('completed');
    // net-zero: the terminal target's claim columns are unchanged (guard fired before any UPDATE)
    const { data: after } = await supabase.from('strategic_directives_v2')
      .select('claiming_session_id, active_session_id, is_working_on').eq('sd_key', key).maybeSingle();
    expect(after?.claiming_session_id ?? null).toBe(before?.claiming_session_id ?? null);
    expect(after?.active_session_id ?? null).toBe(before?.active_session_id ?? null);
    expect(after?.is_working_on ?? null).toBe(before?.is_working_on ?? null);
    // and the session still holds the OLD claim
    const { data: sess } = await supabase.from('claude_sessions')
      .select('sd_key').eq('session_id', PROBE_SESSION).maybeSingle();
    expect(sess?.sd_key).toBe(OLD_PHANTOM);
  });

  it('rejects a cancelled NEW SD with clean sd_terminal_status JSON (skipped if none exist)', async () => {
    const key = await firstSdWithStatus('cancelled');
    if (!key) return;
    const { data, error } = await switchTo(key);
    expect(error).toBeNull();
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('sd_terminal_status');
    expect(data?.status).toBe('cancelled');
  });

  it('rejects a deferred NEW SD with sd_terminal_status (skipped if none exist)', async () => {
    const key = await firstSdWithStatus('deferred');
    if (!key) return;
    const { data } = await switchTo(key);
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('sd_terminal_status');
    expect(data?.status).toBe('deferred');
  });

  it('still switches onto a real unclaimed draft/active SD (guards do not break the happy path)', async () => {
    const { data: cand } = await supabase.from('strategic_directives_v2')
      .select('sd_key, claiming_session_id, active_session_id, is_working_on')
      .is('claiming_session_id', null).in('status', ['draft', 'active']).limit(1);
    if (!cand || !cand[0]) return; // env-dependent
    const key = cand[0].sd_key;
    const { data, error } = await switchTo(key);
    expect(error).toBeNull();
    expect(data?.success).toBe(true);
    expect(data?.new_sd_id).toBe(key);
    // session now holds the NEW claim
    const { data: sess } = await supabase.from('claude_sessions')
      .select('sd_key').eq('session_id', PROBE_SESSION).maybeSingle();
    expect(sess?.sd_key).toBe(key);

    // ---- restore (net-zero) ----
    // 1) reset the NEW SD's claim columns to their captured pre-state
    await supabase.from('strategic_directives_v2').update({
      claiming_session_id: cand[0].claiming_session_id,
      active_session_id: cand[0].active_session_id,
      is_working_on: cand[0].is_working_on,
    }).eq('sd_key', key);
    // 2) put the probe session back onto the phantom OLD claim for any subsequent assertions/teardown
    await supabase.from('claude_sessions').update({ sd_key: OLD_PHANTOM })
      .eq('session_id', PROBE_SESSION);
  });
});
