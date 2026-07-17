/**
 * SD-LEO-INFRA-BLOCK-TEST-SESSION-001 (FR-1) — claim_sd must reject a phantom caller.
 *
 * claim_sd never validated that the CALLING p_session_id has a live row in
 * claude_sessions. Its terminal `UPDATE claude_sessions ... WHERE session_id=p_session_id`
 * silently no-oped on a missing row, but the paired strategic_directives_v2/quick_fixes
 * UPDATE ran unconditionally — so a phantom session_id (witnessed live incident:
 * test-session-nswcf-fenced, zero rows in claude_sessions) could claim a real SD/QF.
 *
 * The new guard fires immediately after the advisory lock, BEFORE the sd_not_found /
 * sd_terminal_status guards and before any FOR UPDATE select — so it applies uniformly
 * to the SD path and the QF path, and pre-empts every other error this RPC can return.
 *
 * Live-DB integration test, gated like the other tests/database suites so CI skips
 * cleanly without service-role creds.
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

const RUN_ID = `${Date.now()}-${process.pid}`;
const PHANTOM_SESSION = `phantom-guard-test-${RUN_ID}`; // deliberately NEVER inserted into claude_sessions
const REGISTERED_SESSION = `test-claim-phantom-guard-registered-${RUN_ID}`;

describe.skipIf(!HAS_REAL_DB)('claim_sd rejects a phantom caller session (SD-LEO-INFRA-BLOCK-TEST-SESSION-001 FR-1)', () => {
  beforeAll(async () => {
    await supabase.from('claude_sessions').upsert({
      session_id: REGISTERED_SESSION,
      status: 'idle',
      heartbeat_at: new Date().toISOString(),
      machine_id: 'test-machine',
      terminal_id: `test-${REGISTERED_SESSION}`,
      hostname: 'test-host',
      codebase: 'EHG_Engineer',
      sd_key: null,
    }, { onConflict: 'session_id' });
    // Guard against test pollution: confirm the phantom id truly has no row.
    await supabase.from('claude_sessions').delete().eq('session_id', PHANTOM_SESSION);
  });

  afterAll(async () => {
    await supabase.from('claude_sessions').delete().eq('session_id', REGISTERED_SESSION);
    await supabase.from('claude_sessions').delete().eq('session_id', PHANTOM_SESSION);
  });

  it('rejects a claim from a session_id with no claude_sessions row (SD path)', async () => {
    const { data: cand } = await supabase.from('strategic_directives_v2')
      .select('sd_key, claiming_session_id').is('claiming_session_id', null).in('status', ['draft', 'active']).limit(1);
    if (!cand || !cand[0]) return; // env-dependent
    const key = cand[0].sd_key;
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: key, p_session_id: PHANTOM_SESSION, p_track: null });
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('phantom_session');
    // zero writes: the SD's claiming_session_id is still untouched
    const { data: after } = await supabase.from('strategic_directives_v2').select('claiming_session_id').eq('sd_key', key).maybeSingle();
    expect(after?.claiming_session_id ?? null).toBe(cand[0].claiming_session_id ?? null);
  });

  it('rejects a phantom claim on the QF path the same way', async () => {
    const { data: qf } = await supabase.from('quick_fixes').select('id, claiming_session_id')
      .is('claiming_session_id', null).not('status', 'in', '(completed,cancelled,escalated)').limit(1);
    if (!qf || !qf[0]) return; // env-dependent
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: qf[0].id, p_session_id: PHANTOM_SESSION, p_track: null });
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('phantom_session');
  });

  it('phantom_session guard fires BEFORE sd_not_found (guard ordering)', async () => {
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: 'SD-FAKE-PROBE-PHANTOM-GUARD-000', p_session_id: PHANTOM_SESSION, p_track: null });
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('phantom_session'); // NOT sd_not_found — the caller-identity guard pre-empts it
  });

  it('does NOT reject a claim from a real registered session (no false positive)', async () => {
    const { data: cand } = await supabase.from('strategic_directives_v2')
      .select('sd_key, claiming_session_id, active_session_id, is_working_on')
      .is('claiming_session_id', null).in('status', ['draft', 'active']).limit(1);
    if (!cand || !cand[0]) return; // env-dependent
    const key = cand[0].sd_key;
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: key, p_session_id: REGISTERED_SESSION, p_track: null });
    expect(data?.success).toBe(true);
    // restore (net-zero)
    await supabase.from('strategic_directives_v2').update({
      claiming_session_id: cand[0].claiming_session_id,
      active_session_id: cand[0].active_session_id,
      is_working_on: cand[0].is_working_on,
    }).eq('sd_key', key);
    await supabase.from('claude_sessions').update({ sd_key: null }).eq('session_id', REGISTERED_SESSION);
  });
});
