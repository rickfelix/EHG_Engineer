/**
 * Claim dual-column atomicity regression tests
 * SD-LEO-INFRA-CLAIM-DUAL-COLUMN-001
 *
 * Verifies the migration database/migrations/20260506000000_claim_dual_column_atomicity.sql:
 *   - FR-1: release_session() clears claiming_session_id alongside active_session_id + is_working_on
 *   - FR-2: cleanup_stale_sessions() clears claiming_session_id on stale-released sessions
 *   - FR-3: switch_sd_claim() clears claiming_session_id on old-SD release branch
 *
 * Invariant under test: after any of the three sibling release/transition functions
 * runs against a session holding an SD claim, the strategic_directives_v2 row has
 * all three claim-state columns at the all-or-none rest state:
 *   claiming_session_id IS NULL AND active_session_id IS NULL AND is_working_on = false
 *
 * Sandbox: All test SDs use SD-DEMO-CDC-* prefix, created/dropped in
 * beforeAll/afterAll. Two synthetic test sessions hold the claims. NO peer
 * Claude Code sessions are touched.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const SD_RELEASE = 'SD-DEMO-CDC-001';
const SD_STALE = 'SD-DEMO-CDC-002';
const SD_SWITCH_OLD = 'SD-DEMO-CDC-003';
const SD_SWITCH_NEW = 'SD-DEMO-CDC-004';
const ALL_TEST_SDS = [SD_RELEASE, SD_STALE, SD_SWITCH_OLD, SD_SWITCH_NEW];

const SESS_RELEASE = 'test-session-cdc-release';
const SESS_STALE = 'test-session-cdc-stale';
const SESS_SWITCH = 'test-session-cdc-switch';
const ALL_TEST_SESSIONS = [SESS_RELEASE, SESS_STALE, SESS_SWITCH];

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
      title: `Test sandbox SD for claim dual-column consistency — ${sdKey}`,
      description: 'Test fixture for SD-LEO-INFRA-CLAIM-DUAL-COLUMN-001 — auto-cleaned',
      rationale: 'Test fixture for SD-LEO-INFRA-CLAIM-DUAL-COLUMN-001 — auto-cleaned',
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

async function setSessionClaim(sessionId, sdKey) {
  const { error } = await supabase
    .from('claude_sessions')
    .update({
      sd_key: sdKey,
      status: 'active',
      claimed_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString()
    })
    .eq('session_id', sessionId);
  if (error) throw new Error(`setSessionClaim failed: ${error.message}`);
  const { error: e2 } = await supabase
    .from('strategic_directives_v2')
    .update({
      claiming_session_id: sessionId,
      active_session_id: sessionId,
      is_working_on: true
    })
    .eq('sd_key', sdKey);
  if (e2) throw new Error(`setSessionClaim SD update failed: ${e2.message}`);
}

async function setSessionHeartbeat(sessionId, secondsAgo) {
  const ts = new Date(Date.now() - secondsAgo * 1000).toISOString();
  const { error } = await supabase
    .from('claude_sessions')
    .update({ heartbeat_at: ts })
    .eq('session_id', sessionId);
  if (error) throw new Error(`setSessionHeartbeat failed: ${error.message}`);
}

async function clearSessionClaim(sessionId) {
  await supabase
    .from('claude_sessions')
    .update({
      sd_key: null,
      status: 'idle',
      claimed_at: null,
      released_at: null,
      released_reason: null,
      stale_at: null,
      stale_reason: null
    })
    .eq('session_id', sessionId);
}

async function clearSDClaim(sdKey) {
  await supabase
    .from('strategic_directives_v2')
    .update({
      claiming_session_id: null,
      active_session_id: null,
      is_working_on: false
    })
    .eq('sd_key', sdKey);
}

async function getSDClaimState(sdKey) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('claiming_session_id, active_session_id, is_working_on')
    .eq('sd_key', sdKey)
    .single();
  if (error) throw new Error(`getSDClaimState failed: ${error.message}`);
  return data;
}

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

describe.skipIf(!HAS_REAL_DB)('claim dual-column atomicity (SD-LEO-INFRA-CLAIM-DUAL-COLUMN-001)', () => {
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
  }, 30000);

  it('FR-1: release_session clears all three claim-state columns atomically', async () => {
    await clearSessionClaim(SESS_RELEASE);
    await clearSDClaim(SD_RELEASE);
    await setSessionClaim(SESS_RELEASE, SD_RELEASE);

    const before = await getSDClaimState(SD_RELEASE);
    expect(before.claiming_session_id).toBe(SESS_RELEASE);
    expect(before.active_session_id).toBe(SESS_RELEASE);
    expect(before.is_working_on).toBe(true);

    const { data: rpcResult, error } = await supabase.rpc('release_session', {
      p_session_id: SESS_RELEASE,
      p_reason: 'test_release'
    });
    expect(error).toBeNull();
    expect(rpcResult.success).toBe(true);

    const after = await getSDClaimState(SD_RELEASE);
    expect(after.claiming_session_id).toBeNull();
    expect(after.active_session_id).toBeNull();
    expect(after.is_working_on).toBe(false);
  }, 30000);

  it('FR-2: cleanup_stale_sessions clears all three claim-state columns on stale releases', async () => {
    await clearSessionClaim(SESS_STALE);
    await clearSDClaim(SD_STALE);
    await setSessionClaim(SESS_STALE, SD_STALE);
    await setSessionHeartbeat(SESS_STALE, 200);

    await supabase
      .from('claude_sessions')
      .update({ stale_at: new Date(Date.now() - 60_000).toISOString(), status: 'stale', stale_reason: 'HEARTBEAT_TIMEOUT' })
      .eq('session_id', SESS_STALE);

    const { data: rpcResult, error } = await supabase.rpc('cleanup_stale_sessions', {
      p_stale_threshold_seconds: 120,
      p_batch_size: 100
    });
    expect(error).toBeNull();
    expect(rpcResult.success).toBe(true);

    const after = await getSDClaimState(SD_STALE);
    expect(after.claiming_session_id).toBeNull();
    expect(after.active_session_id).toBeNull();
    expect(after.is_working_on).toBe(false);
  }, 30000);

  it('FR-3: switch_sd_claim clears all three columns on old SD AND sets all three on new SD', async () => {
    await clearSessionClaim(SESS_SWITCH);
    await clearSDClaim(SD_SWITCH_OLD);
    await clearSDClaim(SD_SWITCH_NEW);
    await setSessionClaim(SESS_SWITCH, SD_SWITCH_OLD);

    const oldBefore = await getSDClaimState(SD_SWITCH_OLD);
    expect(oldBefore.claiming_session_id).toBe(SESS_SWITCH);

    const { data: rpcResult, error } = await supabase.rpc('switch_sd_claim', {
      p_session_id: SESS_SWITCH,
      p_old_sd_id: SD_SWITCH_OLD,
      p_new_sd_id: SD_SWITCH_NEW,
      p_new_track: 'STANDALONE'
    });
    expect(error).toBeNull();
    expect(rpcResult.success).toBe(true);

    const oldAfter = await getSDClaimState(SD_SWITCH_OLD);
    expect(oldAfter.claiming_session_id).toBeNull();
    expect(oldAfter.active_session_id).toBeNull();
    expect(oldAfter.is_working_on).toBe(false);

    const newAfter = await getSDClaimState(SD_SWITCH_NEW);
    expect(newAfter.claiming_session_id).toBe(SESS_SWITCH);
    expect(newAfter.active_session_id).toBe(SESS_SWITCH);
    expect(newAfter.is_working_on).toBe(true);
  }, 30000);
});
