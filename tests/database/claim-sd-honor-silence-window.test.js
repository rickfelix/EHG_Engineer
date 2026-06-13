/**
 * SD-LEO-INFRA-CLAIM-RPC-HONOR-001 — claim_sd must honor an armed silence window.
 *
 * Gap: claim_sd's auto_stale_takeover (v_existing_hb_age >= 900) and drift_recovery branches
 * reaped a holder with ZERO expected_silence_until awareness, so a parked /loop worker that is
 * heartbeat-silent >15min but inside its armed (<=30min) window got its claim reaped — even though
 * cleanup_stale_sessions already exempts it (flag sweep_respect_inflight_agent, LIVE/ON). The
 * migration adds, gated on the SAME flag, a structured {success:false, error:'claimed_by_silenced_peer'}
 * refusal when the holder's expected_silence_until is in the future AND its heartbeat is within the
 * hard-cap ceiling (30 + claim_ttl = 45min). --force and expired / beyond-cap windows STILL take over.
 *
 * Live-DB integration test (the deploy-verification for the migration): gated on HAS_REAL_DB so CI
 * skips cleanly without service-role creds. Hermetic per-run fixtures restored net-zero in afterAll.
 *
 * NOTE: these assertions exercise the DEPLOYED claim_sd. Before the migration is applied to the DB
 * they fail (old claim_sd reaps the silenced holder) — that is the intended deploy gate.
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

const RUN_SUFFIX = `${process.pid}-${Date.now().toString(36)}`;
const PEER = `test-claim-silence-peer-${RUN_SUFFIX}`;   // the silenced holder
const CALLER = `test-claim-silence-caller-${RUN_SUFFIX}`; // the reaper-candidate

let targetKey = null;
let flagOn = false; // captured at beforeAll; the silence guard only activates when the flag is ON

const isoSecsAgo = (s) => new Date(Date.now() - s * 1000).toISOString();
const isoMinsAhead = (m) => new Date(Date.now() + m * 60 * 1000).toISOString();

// AUTO_STALE scenario: PEER holds the SESSION-SIDE claim (sd_key=targetKey) and is silent.
async function resetAutoStale({ hbSecsAgo, silenceUntil }) {
  await supabase.from('claude_sessions').upsert(
    { session_id: PEER, status: 'active', heartbeat_at: isoSecsAgo(hbSecsAgo), sd_key: targetKey, expected_silence_until: silenceUntil },
    { onConflict: 'session_id' });
  await supabase.from('claude_sessions').upsert(
    { session_id: CALLER, status: 'active', heartbeat_at: isoSecsAgo(5), sd_key: null, expected_silence_until: null },
    { onConflict: 'session_id' });
  await supabase.from('strategic_directives_v2')
    .update({ claiming_session_id: PEER, active_session_id: PEER, is_working_on: true })
    .eq('sd_key', targetKey);
}

// DRIFT scenario: PEER holds only the SD-SIDE claim (claiming_session_id), its session-side sd_key
// drifted to NULL, and it is silent (>=900s so the live-foreign guard does not catch it first).
async function resetDrift({ hbSecsAgo, silenceUntil }) {
  await supabase.from('claude_sessions').upsert(
    { session_id: PEER, status: 'active', heartbeat_at: isoSecsAgo(hbSecsAgo), sd_key: null, expected_silence_until: silenceUntil },
    { onConflict: 'session_id' });
  await supabase.from('claude_sessions').upsert(
    { session_id: CALLER, status: 'active', heartbeat_at: isoSecsAgo(5), sd_key: null, expected_silence_until: null },
    { onConflict: 'session_id' });
  await supabase.from('strategic_directives_v2')
    .update({ claiming_session_id: PEER, active_session_id: null, is_working_on: false })
    .eq('sd_key', targetKey);
}

const claim = (session, force = false) =>
  supabase.rpc('claim_sd', { p_sd_id: targetKey, p_session_id: session, p_track: null, p_force_takeover: force }).then(r => r.data);

const sdClaimant = () =>
  supabase.from('strategic_directives_v2').select('claiming_session_id').eq('sd_key', targetKey).maybeSingle().then(r => r.data?.claiming_session_id);

describe.skipIf(!HAS_REAL_DB)('claim_sd honors an armed silence window (SD-LEO-INFRA-CLAIM-RPC-HONOR-001)', () => {
  beforeAll(async () => {
    const { data: cfg } = await supabase.from('chairman_dashboard_config').select('metadata').eq('config_key', 'default').maybeSingle();
    flagOn = String(cfg?.metadata?.sweep_respect_inflight_agent) === 'true';
    const key = `SD-TEST-CLAIM-SILENCE-${RUN_SUFFIX}`.toUpperCase();
    const { error } = await supabase.from('strategic_directives_v2').insert({
      sd_key: key, id: key,
      title: 'TEST FIXTURE: claim_sd silence-window scenario — safe to delete',
      description: 'Scratch SD created by tests/database/claim-sd-honor-silence-window.test.js; deleted in afterAll.',
      status: 'draft', sd_type: 'bugfix', category: 'test_fixture', priority: 'low',
    });
    if (error) return;
    targetKey = key;
  });

  afterAll(async () => {
    if (targetKey) await supabase.from('strategic_directives_v2').delete().eq('sd_key', targetKey);
    await supabase.from('claude_sessions').delete().eq('session_id', PEER);
    await supabase.from('claude_sessions').delete().eq('session_id', CALLER);
  });

  it('auto_stale: REFUSES (claimed_by_silenced_peer) a >900s-silent holder inside its armed window', async () => {
    if (!targetKey || !flagOn) return; // guard only active with the flag ON
    await resetAutoStale({ hbSecsAgo: 1000, silenceUntil: isoMinsAhead(20) });
    const data = await claim(CALLER);
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('claimed_by_silenced_peer');
    expect(data?.claimed_by).toBe(PEER);
    expect(await sdClaimant()).toBe(PEER); // net-zero: holder not reaped
  });

  it('auto_stale: STILL TAKES OVER when the silence window has EXPIRED', async () => {
    if (!targetKey) return;
    await resetAutoStale({ hbSecsAgo: 1000, silenceUntil: isoSecsAgo(60) }); // window already past
    const data = await claim(CALLER);
    expect(data?.success).toBe(true);
    expect(data?.takeover).toBe(true);
  });

  it('auto_stale: STILL TAKES OVER beyond the hard-cap even with a future window (no forever-wedge)', async () => {
    if (!targetKey) return;
    await resetAutoStale({ hbSecsAgo: 3000, silenceUntil: isoMinsAhead(60) }); // hb 50min > 45min cap
    const data = await claim(CALLER);
    expect(data?.success).toBe(true);
    expect(data?.takeover).toBe(true);
  });

  it('auto_stale: --force ALWAYS overrides an armed silence window', async () => {
    if (!targetKey) return;
    await resetAutoStale({ hbSecsAgo: 1000, silenceUntil: isoMinsAhead(20) });
    const data = await claim(CALLER, true);
    expect(data?.success).toBe(true);
    expect(data?.takeover).toBe(true);
  });

  it('drift_recovery: REFUSES a silenced SD-side claimant (>900s, drifted session pointer)', async () => {
    if (!targetKey || !flagOn) return;
    await resetDrift({ hbSecsAgo: 1000, silenceUntil: isoMinsAhead(20) });
    const data = await claim(CALLER);
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('claimed_by_silenced_peer');
    expect(await sdClaimant()).toBe(PEER); // net-zero
  });

  it('drift_recovery: STILL TAKES OVER a silenced claimant once the window expires', async () => {
    if (!targetKey) return;
    await resetDrift({ hbSecsAgo: 1000, silenceUntil: isoSecsAgo(60) });
    const data = await claim(CALLER);
    expect(data?.success).toBe(true);
    expect(data?.takeover).toBe(true);
  });

  it('does NOT fire for a self-resume (holder re-claims its own SD)', async () => {
    if (!targetKey) return;
    await resetAutoStale({ hbSecsAgo: 1000, silenceUntil: isoMinsAhead(20) });
    const data = await claim(PEER); // caller == holder
    expect(data?.success).toBe(true); // guard requires a FOREIGN holder
  });
});
