/**
 * SD-LEO-INFRA-QF-CLAIM-PEER-GUARD-001 — claim_sd must refuse to overwrite a LIVE foreign
 * claim on the QF branch, and must stamp quick_fixes.started_at on claim.
 *
 * Gap: SD-LEO-FIX-CLAIM-RPC-REFUSE-001 (tests/database/claim-sd-refuse-live-foreign.test.js)
 * added the live-foreign-claim guard for the SD branch only. The QF branch never checked
 * whether quick_fixes.claiming_session_id named a still-live session before letting a second
 * self-claimer stomp it (the drifted-session-pointer case). Separately, quick_fixes.started_at
 * was never stamped by claim_sd's QF UPDATE — only scripts/create-quick-fix.js's one-time
 * creation-claim stamp set it, so a QF claimed later via the normal RPC path never got a
 * started_at value.
 *
 * Live-DB integration test, gated like the other tests/database suites so CI skips cleanly
 * without service-role creds. The scenario is set up on a dedicated scratch QF and deleted in
 * afterAll; the two probe sessions are deleted too.
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

// Hermetic per-run fixtures (same pattern as claim-sd-refuse-live-foreign.test.js, QF-20260612-167)
// so overlapping CI legs never collide on a shared target.
const RUN_SUFFIX = `${process.pid}-${Date.now().toString(36)}`;
const PEER = `test-qf-guard-peer-${RUN_SUFFIX}`;     // the live foreign claimant (QF-side claim holder)
const CALLER = `test-qf-guard-caller-${RUN_SUFFIX}`; // the second self-claimer

let targetQfId = null;

const isoSecsAgo = (s) => new Date(Date.now() - s * 1000).toISOString();

// Fully reset the scenario before each test: PEER fresh+claimless, CALLER claimless,
// QF-side claim set to PEER (the drift case — PEER's session-side sd_key stays NULL) and
// started_at cleared so the stamp-on-claim assertion always starts from a clean slate.
async function resetScenario(peerHbSecsAgo = 10, peerSessionStatus = 'active') {
  await supabase.from('claude_sessions').upsert(
    { session_id: PEER, status: peerSessionStatus, heartbeat_at: isoSecsAgo(peerHbSecsAgo), sd_key: null },
    { onConflict: 'session_id' });
  await supabase.from('claude_sessions').upsert(
    { session_id: CALLER, status: 'active', heartbeat_at: isoSecsAgo(5), sd_key: null },
    { onConflict: 'session_id' });
  await supabase.from('quick_fixes')
    .update({ claiming_session_id: PEER, status: 'open', started_at: null })
    .eq('id', targetQfId);
}

describe.skipIf(!HAS_REAL_DB)('claim_sd QF-branch live-peer guard + started_at stamp (SD-LEO-INFRA-QF-CLAIM-PEER-GUARD-001)', () => {
  beforeAll(async () => {
    // Defensive: a prior run that crashed/timed out mid-test can orphan a QF-TESTGUARD-* row
    // (status='in_progress', claiming_session_id pointing at a since-deleted session) — exactly
    // the phantom state fleet sweeps hunt. Sweep our own prefix before creating a fresh fixture.
    await supabase.from('quick_fixes').delete().like('id', 'QF-TESTGUARD-%');

    // Dedicated scratch QF — no run can pick the same target as another run.
    const id = `QF-TESTGUARD-${RUN_SUFFIX}`.toUpperCase().slice(0, 40);
    const { error } = await supabase.from('quick_fixes').insert({
      id,
      title: 'TEST FIXTURE (SD-LEO-INFRA-QF-CLAIM-PEER-GUARD-001): claim_sd QF live-peer-guard scenario — safe to delete',
      type: 'bug',
      severity: 'low',
      description: 'Scratch QF created by tests/database/claim-sd-qf-live-peer-guard.test.js; deleted in afterAll.',
      status: 'open',
    });
    if (error) return; // env-dependent (insert blocked) — tests no-op like the old no-candidate path
    targetQfId = id;
  });

  afterAll(async () => {
    if (targetQfId) {
      await supabase.from('quick_fixes').delete().eq('id', targetQfId);
    }
    await supabase.from('claude_sessions').delete().eq('session_id', PEER);
    await supabase.from('claude_sessions').delete().eq('session_id', CALLER);
  });

  it('refuses (claimed_by_live_peer) and does NOT stomp a fresh-heartbeat foreign QF claim', async () => {
    if (!targetQfId) return;
    await resetScenario(10); // peer is live
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: targetQfId, p_session_id: CALLER, p_track: null });
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('claimed_by_live_peer');
    expect(data?.claimed_by).toBe(PEER);
    // net-zero: the QF-side claim is still PEER, not stomped to CALLER
    const { data: after } = await supabase.from('quick_fixes')
      .select('claiming_session_id').eq('id', targetQfId).maybeSingle();
    expect(after?.claiming_session_id).toBe(PEER);
    // and CALLER did not acquire the session-side key
    const { data: sess } = await supabase.from('claude_sessions').select('sd_key').eq('session_id', CALLER).maybeSingle();
    expect(sess?.sd_key ?? null).not.toBe(targetQfId);
  });

  it('still TAKES OVER a stale (>=900s) foreign QF claim (drift_recovery preserved)', async () => {
    if (!targetQfId) return;
    await resetScenario(1000); // peer is stale
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: targetQfId, p_session_id: CALLER, p_track: null });
    expect(data?.success).toBe(true);
    // v_drift_detected/takeover is SD-only (no QF equivalent) so `takeover` isn't asserted here —
    // instead confirm the claim ACTUALLY MOVED to CALLER, so a guard that silently never fires
    // (and never re-writes the row) can't pass this test as a false positive.
    const { data: after } = await supabase.from('quick_fixes')
      .select('claiming_session_id').eq('id', targetQfId).maybeSingle();
    expect(after?.claiming_session_id).toBe(CALLER);
  });

  it('still TAKES OVER with --force on a live foreign QF claim', async () => {
    if (!targetQfId) return;
    await resetScenario(10); // peer is live, but force overrides
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: targetQfId, p_session_id: CALLER, p_track: null, p_force_takeover: true });
    expect(data?.success).toBe(true);
    const { data: after } = await supabase.from('quick_fixes')
      .select('claiming_session_id').eq('id', targetQfId).maybeSingle();
    expect(after?.claiming_session_id).toBe(CALLER);
  });

  it('does NOT fire for a self-resume (the QF-side claimant re-claims its own QF)', async () => {
    if (!targetQfId) return;
    await resetScenario(10); // claim is PEER, fresh
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: targetQfId, p_session_id: PEER, p_track: null });
    expect(data?.success).toBe(true); // guard requires claimant != caller, so self-resume proceeds
    const { data: after } = await supabase.from('quick_fixes')
      .select('claiming_session_id').eq('id', targetQfId).maybeSingle();
    expect(after?.claiming_session_id).toBe(PEER);
  });

  it('does NOT fire for an unclaimed QF (guard requires a non-null foreign claimant)', async () => {
    if (!targetQfId) return;
    await resetScenario(10);
    await supabase.from('quick_fixes').update({ claiming_session_id: null }).eq('id', targetQfId);
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: targetQfId, p_session_id: CALLER, p_track: null });
    expect(data?.success).toBe(true);
    const { data: after } = await supabase.from('quick_fixes')
      .select('claiming_session_id').eq('id', targetQfId).maybeSingle();
    expect(after?.claiming_session_id).toBe(CALLER);
  });

  it('refuses a LIVE peer whose claude_sessions row is status=idle (not just active)', async () => {
    if (!targetQfId) return;
    await resetScenario(10, 'idle'); // peer is live but idle — capture SELECT filters status IN ('active','idle')
    const { data } = await supabase.rpc('claim_sd', { p_sd_id: targetQfId, p_session_id: CALLER, p_track: null });
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('claimed_by_live_peer');
    const { data: after } = await supabase.from('quick_fixes')
      .select('claiming_session_id').eq('id', targetQfId).maybeSingle();
    expect(after?.claiming_session_id).toBe(PEER);
  });

  it('refuses at 899s (just under the 900s live/stale boundary) and takes over at 901s (just over)', async () => {
    if (!targetQfId) return;
    await resetScenario(899);
    const under = await supabase.rpc('claim_sd', { p_sd_id: targetQfId, p_session_id: CALLER, p_track: null });
    expect(under.data?.success).toBe(false);
    expect(under.data?.error).toBe('claimed_by_live_peer');

    await resetScenario(901);
    const over = await supabase.rpc('claim_sd', { p_sd_id: targetQfId, p_session_id: CALLER, p_track: null });
    expect(over.data?.success).toBe(true);
    const { data: after } = await supabase.from('quick_fixes')
      .select('claiming_session_id').eq('id', targetQfId).maybeSingle();
    expect(after?.claiming_session_id).toBe(CALLER);
  });

  it('stamps started_at on a fresh claim and preserves it across a later re-claim', async () => {
    if (!targetQfId) return;
    // Fresh claim: started_at was NULL (reset by resetScenario above), unclaimed QF.
    await resetScenario(10);
    await supabase.from('quick_fixes').update({ claiming_session_id: null }).eq('id', targetQfId);
    const { data: first } = await supabase.rpc('claim_sd', { p_sd_id: targetQfId, p_session_id: CALLER, p_track: null });
    expect(first?.success).toBe(true);
    const { data: afterFirst } = await supabase.from('quick_fixes')
      .select('started_at').eq('id', targetQfId).maybeSingle();
    expect(afterFirst?.started_at).toBeTruthy();
    const firstStartedAt = afterFirst.started_at;

    // Release the CALLER's session-side sd_key (simulating a park/release) then re-claim the
    // SAME QF by the same session — started_at must be PRESERVED (COALESCE), not reset to a
    // later NOW().
    await supabase.from('claude_sessions').update({ sd_key: null }).eq('session_id', CALLER);
    const { data: second } = await supabase.rpc('claim_sd', { p_sd_id: targetQfId, p_session_id: CALLER, p_track: null });
    expect(second?.success).toBe(true);
    const { data: afterSecond } = await supabase.from('quick_fixes')
      .select('started_at').eq('id', targetQfId).maybeSingle();
    expect(afterSecond?.started_at).toBe(firstStartedAt);
  });

  it('preserves started_at across a FOREIGN takeover (--force), not just a same-session re-claim', async () => {
    if (!targetQfId) return;
    // PEER claims fresh (stamps started_at), then CALLER force-takes-over from PEER while PEER
    // is still live — started_at must still be PRESERVED, proving COALESCE (not NOW()) governs
    // the takeover path too, not only the same-session re-claim path covered by the test above.
    await resetScenario(10);
    await supabase.from('quick_fixes').update({ claiming_session_id: null }).eq('id', targetQfId);
    const { data: peerClaim } = await supabase.rpc('claim_sd', { p_sd_id: targetQfId, p_session_id: PEER, p_track: null });
    expect(peerClaim?.success).toBe(true);
    const { data: afterPeer } = await supabase.from('quick_fixes')
      .select('started_at').eq('id', targetQfId).maybeSingle();
    expect(afterPeer?.started_at).toBeTruthy();
    const peerStartedAt = afterPeer.started_at;

    const { data: forced } = await supabase.rpc('claim_sd', { p_sd_id: targetQfId, p_session_id: CALLER, p_track: null, p_force_takeover: true });
    expect(forced?.success).toBe(true);
    const { data: afterForced } = await supabase.from('quick_fixes')
      .select('claiming_session_id, started_at').eq('id', targetQfId).maybeSingle();
    expect(afterForced?.claiming_session_id).toBe(CALLER);
    expect(afterForced?.started_at).toBe(peerStartedAt);
  });
});
