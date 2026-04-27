/**
 * claim_sd cross-table consistency regression tests
 * SD-LEO-INFRA-CLAIM-CROSS-TABLE-CONSISTENCY-001
 *
 * Verifies the migration database/migrations/20260427_claim_sd_cross_table_consistency.sql:
 *   - FR-1: Cross-table existing-claim check (JOINs claude_sessions + strategic_directives_v2)
 *   - FR-2: Inline NULL of prior session sd_key on takeover
 *   - FR-3: p_force_takeover with default-deny authorization predicate
 *   - FR-4: session_lifecycle_events audit emission
 *   - FR-5: Bracket-tokenized error variants
 *
 * Sandbox: All test SDs use SD-DEMO-RACE-* prefix, created/dropped in
 * beforeAll/afterAll. Two synthetic test sessions ('test-session-A',
 * 'test-session-B') hold the racing claims. NO peer Claude Code sessions
 * are touched.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const SD_RACE = 'SD-DEMO-RACE-001';
const SD_DRIFT = 'SD-DEMO-RACE-002';
const SD_FORCE_AUTH = 'SD-DEMO-RACE-003';
const SD_FORCE_UNAUTH = 'SD-DEMO-RACE-004';
const SD_AUTO_STALE = 'SD-DEMO-RACE-005';
const ALL_TEST_SDS = [SD_RACE, SD_DRIFT, SD_FORCE_AUTH, SD_FORCE_UNAUTH, SD_AUTO_STALE];

const SESS_A = 'test-session-A-claim-cross-table';
const SESS_B = 'test-session-B-claim-cross-table';
const ALL_TEST_SESSIONS = [SESS_A, SESS_B];

async function ensureTestSession(sessionId) {
  const { error } = await supabase
    .from('claude_sessions')
    .upsert({
      session_id: sessionId,
      status: 'idle',
      heartbeat_at: new Date().toISOString(),
      machine_id: 'test-machine',
      terminal_id: `test-${sessionId}`,
      hostname: 'test-host',
      codebase: 'EHG_Engineer'
    }, { onConflict: 'session_id' });
  if (error) throw new Error(`ensureTestSession ${sessionId} failed: ${error.message}`);
}

async function ensureTestSD(sdKey) {
  const { error } = await supabase
    .from('strategic_directives_v2')
    .upsert({
      id: sdKey,
      sd_key: sdKey,
      title: `Test sandbox SD for claim_sd race testing — ${sdKey}`,
      description: 'Test fixture for claim_sd race testing — auto-cleaned',
      rationale: 'Test fixture for SD-LEO-INFRA-CLAIM-CROSS-TABLE-CONSISTENCY-001 — auto-cleaned',
      scope: 'Test sandbox only',
      sd_type: 'infrastructure',
      category: 'infrastructure',
      priority: 'low',
      status: 'draft',
      current_phase: 'LEAD',
      target_application: 'EHG_Engineer',
      claiming_session_id: null,
      active_session_id: null,
      is_working_on: false
    }, { onConflict: 'sd_key' });
  if (error) throw new Error(`ensureTestSD ${sdKey} failed: ${error.message}`);
}

async function setSessionHeartbeat(sessionId, secondsAgo) {
  const ts = new Date(Date.now() - secondsAgo * 1000).toISOString();
  const { error } = await supabase
    .from('claude_sessions')
    .update({ heartbeat_at: ts })
    .eq('session_id', sessionId);
  if (error) throw new Error(`setSessionHeartbeat ${sessionId} failed: ${error.message}`);
}

async function setSessionClaim(sessionId, sdKey) {
  const { error } = await supabase
    .from('claude_sessions')
    .update({ sd_key: sdKey, status: 'active', claimed_at: new Date().toISOString() })
    .eq('session_id', sessionId);
  if (error) throw new Error(`setSessionClaim failed: ${error.message}`);
  // Also update the SD row to match (mimics what claim_sd would have done)
  const { error: e2 } = await supabase
    .from('strategic_directives_v2')
    .update({ claiming_session_id: sessionId, active_session_id: sessionId, is_working_on: true })
    .eq('sd_key', sdKey);
  if (e2) throw new Error(`setSessionClaim SD update failed: ${e2.message}`);
}

async function clearSessionClaim(sessionId) {
  await supabase
    .from('claude_sessions')
    .update({ sd_key: null, status: 'idle', claimed_at: null })
    .eq('session_id', sessionId);
}

async function clearSDClaim(sdKey) {
  await supabase
    .from('strategic_directives_v2')
    .update({ claiming_session_id: null, active_session_id: null, is_working_on: false })
    .eq('sd_key', sdKey);
}

async function callClaimSd({ sd, session, track = 'STANDALONE', force = false }) {
  const { data, error } = await supabase.rpc('claim_sd', {
    p_sd_id: sd,
    p_session_id: session,
    p_track: track,
    p_force_takeover: force
  });
  if (error) throw new Error(`claim_sd RPC error: ${error.message}`);
  return data;
}

async function getLatestEvent(sessionId, sdKey) {
  const { data, error } = await supabase
    .from('session_lifecycle_events')
    .select('event_type, reason, metadata, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw new Error(`getLatestEvent failed: ${error.message}`);
  return (data || []).find(e => e.metadata?.sd_key === sdKey) || null;
}

describe('claim_sd cross-table consistency (SD-LEO-INFRA-CLAIM-CROSS-TABLE-CONSISTENCY-001)', () => {
  beforeAll(async () => {
    for (const s of ALL_TEST_SESSIONS) await ensureTestSession(s);
    for (const sd of ALL_TEST_SDS) await ensureTestSD(sd);
  }, 30000);

  afterAll(async () => {
    for (const sd of ALL_TEST_SDS) {
      await clearSDClaim(sd);
      await supabase.from('strategic_directives_v2').delete().eq('sd_key', sd);
    }
    for (const s of ALL_TEST_SESSIONS) {
      await clearSessionClaim(s);
      await supabase.from('claude_sessions').delete().eq('session_id', s);
    }
    await supabase
      .from('session_lifecycle_events')
      .delete()
      .in('session_id', ALL_TEST_SESSIONS);
  }, 30000);

  it('TS-1: two-session race — exactly one session wins', async () => {
    await clearSessionClaim(SESS_A);
    await clearSessionClaim(SESS_B);
    await clearSDClaim(SD_RACE);
    await setSessionHeartbeat(SESS_A, 0);
    await setSessionHeartbeat(SESS_B, 0);

    const [resA, resB] = await Promise.all([
      callClaimSd({ sd: SD_RACE, session: SESS_A }),
      callClaimSd({ sd: SD_RACE, session: SESS_B })
    ]);

    const winners = [resA, resB].filter(r => r.success === true);
    const losers = [resA, resB].filter(r => r.success === false);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].error).toBe('already_claimed');
    expect(losers[0].message).toMatch(/\[CLAIM_PEER_ACTIVE\]/);

    // Verify exactly one claude_sessions row holds the SD
    const { data: holders } = await supabase
      .from('claude_sessions')
      .select('session_id')
      .eq('sd_key', SD_RACE);
    expect(holders).toHaveLength(1);
    expect([SESS_A, SESS_B]).toContain(holders[0].session_id);

    // Verify SD row matches
    const { data: sdRow } = await supabase
      .from('strategic_directives_v2')
      .select('claiming_session_id')
      .eq('sd_key', SD_RACE)
      .single();
    expect(sdRow.claiming_session_id).toBe(holders[0].session_id);
  }, 20000);

  it('TS-2: cross-table drift — SD row claimed but no active session', async () => {
    await clearSessionClaim(SESS_A);
    await clearSessionClaim(SESS_B);
    // Set SD claimed by an orphan session that doesn't exist in claude_sessions
    await supabase
      .from('strategic_directives_v2')
      .update({ claiming_session_id: 'orphan-session-does-not-exist', is_working_on: true })
      .eq('sd_key', SD_DRIFT);

    // SESS_B claims without force — should succeed via drift_recovery (cross-table check
    // detects SD pointer is stale because no active claude_sessions row matches)
    const res = await callClaimSd({ sd: SD_DRIFT, session: SESS_B });
    expect(res.success).toBe(true);
    expect(res.takeover).toBe(true);
    expect(res.drift_detected).toBe(true);
    expect(res.takeover_reason).toBe('drift_recovery');

    // Audit row emitted
    const evt = await getLatestEvent(SESS_B, SD_DRIFT);
    expect(evt).not.toBeNull();
    expect(['CLAIM_TAKEOVER', 'CLAIM_AUTO_RECLAIM']).toContain(evt.event_type);
    expect(evt.metadata.drift_detected).toBe(true);
  }, 15000);

  it('TS-3: authorized force-takeover (prior heartbeat ≥60s)', async () => {
    await clearSessionClaim(SESS_A);
    await clearSessionClaim(SESS_B);
    await clearSDClaim(SD_FORCE_AUTH);

    // SESS_A claims, then we age its heartbeat to 70s
    await setSessionHeartbeat(SESS_A, 0);
    const claim = await callClaimSd({ sd: SD_FORCE_AUTH, session: SESS_A });
    expect(claim.success).toBe(true);
    await setSessionHeartbeat(SESS_A, 70);

    // SESS_B force-takeover succeeds (heartbeat threshold)
    const res = await callClaimSd({ sd: SD_FORCE_AUTH, session: SESS_B, force: true });
    expect(res.success).toBe(true);
    expect(res.takeover).toBe(true);
    expect(res.takeover_reason).toBe('force_heartbeat_threshold');
    expect(res.prior_session_id).toBe(SESS_A);

    // SESS_A's claude_sessions row is NULLed (FR-2)
    const { data: aRow } = await supabase
      .from('claude_sessions')
      .select('sd_key, status, released_reason')
      .eq('session_id', SESS_A)
      .single();
    expect(aRow.sd_key).toBeNull();
    expect(aRow.released_reason).toBe('force_heartbeat_threshold');

    // Audit row
    const evt = await getLatestEvent(SESS_B, SD_FORCE_AUTH);
    expect(evt.event_type).toBe('CLAIM_TAKEOVER');
    expect(evt.metadata.prior_session_id).toBe(SESS_A);
    expect(Number(evt.metadata.prior_heartbeat_age_seconds)).toBeGreaterThanOrEqual(60);
    expect(evt.metadata.force_authorized_by).toBe('force_heartbeat_threshold');
  }, 20000);

  it('TS-4: unauthorized force-takeover (heartbeat <60s, no parent authority)', async () => {
    await clearSessionClaim(SESS_A);
    await clearSessionClaim(SESS_B);
    await clearSDClaim(SD_FORCE_UNAUTH);

    await setSessionHeartbeat(SESS_A, 0);
    const claim = await callClaimSd({ sd: SD_FORCE_UNAUTH, session: SESS_A });
    expect(claim.success).toBe(true);
    // Keep heartbeat fresh (5s old)
    await setSessionHeartbeat(SESS_A, 5);
    await setSessionHeartbeat(SESS_B, 0);

    const res = await callClaimSd({ sd: SD_FORCE_UNAUTH, session: SESS_B, force: true });
    expect(res.success).toBe(false);
    expect(res.error).toBe('unauthorized_force');
    expect(res.message).toMatch(/\[CLAIM_FORCE_DENIED\]/);

    // SESS_A still owns the claim
    const { data: holders } = await supabase
      .from('claude_sessions')
      .select('session_id')
      .eq('sd_key', SD_FORCE_UNAUTH);
    expect(holders).toHaveLength(1);
    expect(holders[0].session_id).toBe(SESS_A);
  }, 15000);

  it('TS-5: auto-stale takeover (heartbeat ≥900s, no force needed)', async () => {
    await clearSessionClaim(SESS_A);
    await clearSessionClaim(SESS_B);
    await clearSDClaim(SD_AUTO_STALE);

    // SESS_A claims, heartbeat aged to 1000s
    await setSessionHeartbeat(SESS_A, 0);
    await callClaimSd({ sd: SD_AUTO_STALE, session: SESS_A });
    await setSessionHeartbeat(SESS_A, 1000);

    // SESS_B claims WITHOUT force — auto-stale path triggers
    const res = await callClaimSd({ sd: SD_AUTO_STALE, session: SESS_B, force: false });
    expect(res.success).toBe(true);
    expect(res.takeover).toBe(true);
    expect(res.takeover_reason).toBe('auto_stale_takeover');
    expect(Number(res.prior_heartbeat_age_seconds)).toBeGreaterThanOrEqual(900);

    // Audit row uses CLAIM_AUTO_RECLAIM (not CLAIM_TAKEOVER)
    const evt = await getLatestEvent(SESS_B, SD_AUTO_STALE);
    expect(evt.event_type).toBe('CLAIM_AUTO_RECLAIM');
    expect(evt.metadata.force_authorized_by).toBeNull();
  }, 20000);

  it('TS-6: backward compat — existing 3-arg callers unaffected', async () => {
    // Simulate the existing caller pattern: only 3 args (omit p_force_takeover)
    await clearSessionClaim(SESS_A);
    await clearSDClaim(SD_RACE);
    await setSessionHeartbeat(SESS_A, 0);

    const { data, error } = await supabase.rpc('claim_sd', {
      p_sd_id: SD_RACE,
      p_session_id: SESS_A,
      p_track: 'STANDALONE'
      // p_force_takeover omitted — must default to FALSE
    });
    expect(error).toBeNull();
    expect(data.success).toBe(true);
    expect(data.takeover).toBe(false);
  }, 10000);
});
