/**
 * SD-LEO-FIX-CLAIM-RPC-REFUSE-001 — claim_sd must refuse to overwrite a LIVE foreign claim.
 *
 * Gap: claim_sd's drift_recovery path auto-took the SD-side claim
 * (strategic_directives_v2.claiming_session_id) whenever no matching session-side pointer
 * (claude_sessions.sd_key) was found — WITHOUT checking whether the SD-side claimant was itself
 * still LIVE. So a live peer holding only the SD-side claim (its session pointer drifted, e.g.
 * after a defer/sweep/clear) got stomped by a second self-claimer. This guard refuses with
 * {success:false, error:'claimed_by_live_peer'} when the SD-side claimant is a fresh-heartbeat
 * foreign session and p_force_takeover is false. Stale (>=900s) / orphaned claims still fall
 * through to takeover; --force still works; unclaimed + self-resume are unaffected.
 *
 * Live-DB integration test, gated like the other tests/database suites so CI skips cleanly
 * without service-role creds. The scenario is set up on a real unclaimed SD and restored
 * net-zero in afterAll; the two probe sessions are deleted.
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

// Quick-fix QF-20260612-167: fixed session ids + a shared first-unclaimed-SD
// target collided when overlapping CI runs (main legs ~20s apart + PR legs)
// executed this suite concurrently against the live DB — each run stomped the
// other's scenario (witnessed 102->106 red-merge at 38c233f9, self-resolved
// when runs stopped overlapping). Fixtures are now hermetic per run: unique
// suffix on the probe sessions and a dedicated scratch draft SD.
const RUN_SUFFIX = `${process.pid}-${Date.now().toString(36)}`;
const PEER = `test-claim-refuse-live-peer-${RUN_SUFFIX}`;   // the live foreign claimant (SD-side claim holder)
const CALLER = `test-claim-refuse-caller-${RUN_SUFFIX}`;    // the second self-claimer

let targetKey = null;

const isoSecsAgo = (s) => new Date(Date.now() - s * 1000).toISOString();

// Fully reset the scenario before each test: PEER fresh+claimless, CALLER claimless,
// SD-side claim set to PEER (the drift case — PEER's session-side sd_key stays NULL).
async function resetScenario(peerHbSecsAgo = 10) {
  await supabase.from('claude_sessions').upsert(
    { session_id: PEER, status: 'active', heartbeat_at: isoSecsAgo(peerHbSecsAgo), sd_key: null },
    { onConflict: 'session_id' });
  await supabase.from('claude_sessions').upsert(
    { session_id: CALLER, status: 'active', heartbeat_at: isoSecsAgo(5), sd_key: null },
    { onConflict: 'session_id' });
  await supabase.from('strategic_directives_v2')
    .update({ claiming_session_id: PEER, active_session_id: null, is_working_on: false })
    .eq('sd_key', targetKey);
}

describe.skipIf(!HAS_REAL_DB)('claim_sd refuses a LIVE foreign claim (SD-LEO-FIX-CLAIM-RPC-REFUSE-001)', () => {
  beforeAll(async () => {
    // Dedicated scratch SD — no run can pick the same target as another run.
    const key = `SD-TEST-CLAIM-REFUSE-${RUN_SUFFIX}`.toUpperCase();
    const { error } = await supabase.from('strategic_directives_v2').insert({
      sd_key: key,
      id: key,
      title: 'TEST FIXTURE (QF-20260612-167): claim_sd live-foreign-refusal scenario — safe to delete',
      description: 'Scratch SD created by tests/database/claim-sd-refuse-live-foreign.test.js; deleted in afterAll.',
      status: 'draft',
      sd_type: 'bugfix',
      category: 'test_fixture',
      priority: 'low',
    });
    if (error) return; // env-dependent (insert blocked) — tests no-op like the old no-candidate path
    targetKey = key;
  });

  afterAll(async () => {
    if (targetKey) {
      await supabase.from('strategic_directives_v2').delete().eq('sd_key', targetKey);
    }
    await supabase.from('claude_sessions').delete().eq('session_id', PEER);
    await supabase.from('claude_sessions').delete().eq('session_id', CALLER);
  });

  it('refuses (claimed_by_live_peer) and does NOT stomp a fresh-heartbeat foreign claim', async () => {
    if (!targetKey) return;
    await resetScenario(10); // peer is live
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: targetKey, p_session_id: CALLER, p_track: null });
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('claimed_by_live_peer');
    expect(data?.claimed_by).toBe(PEER);
    // net-zero: the SD-side claim is still PEER, not stomped to CALLER
    const { data: after } = await supabase.from('strategic_directives_v2')
      .select('claiming_session_id').eq('sd_key', targetKey).maybeSingle();
    expect(after?.claiming_session_id).toBe(PEER);
    // and CALLER did not acquire the session-side key
    const { data: sess } = await supabase.from('claude_sessions').select('sd_key').eq('session_id', CALLER).maybeSingle();
    expect(sess?.sd_key ?? null).not.toBe(targetKey);
  });

  it('still TAKES OVER a stale (>=900s) foreign claim (drift_recovery preserved)', async () => {
    if (!targetKey) return;
    await resetScenario(1000); // peer is stale
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: targetKey, p_session_id: CALLER, p_track: null });
    expect(data?.success).toBe(true);
    expect(data?.takeover).toBe(true);
  });

  it('still TAKES OVER with --force on a live foreign claim', async () => {
    if (!targetKey) return;
    await resetScenario(10); // peer is live, but force overrides
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: targetKey, p_session_id: CALLER, p_track: null, p_force_takeover: true });
    expect(data?.success).toBe(true);
  });

  it('does NOT fire for a self-resume (the SD-side claimant re-claims its own SD)', async () => {
    if (!targetKey) return;
    await resetScenario(10); // claim is PEER, fresh
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: targetKey, p_session_id: PEER, p_track: null });
    expect(data?.success).toBe(true); // guard requires claimant != caller, so self-resume proceeds
  });

  it('does NOT fire for an unclaimed SD (guard requires a non-null foreign claimant)', async () => {
    if (!targetKey) return;
    await resetScenario(10);
    await supabase.from('strategic_directives_v2').update({ claiming_session_id: null }).eq('sd_key', targetKey);
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: targetKey, p_session_id: CALLER, p_track: null });
    expect(data?.success).toBe(true);
  });
});
