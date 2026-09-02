/**
 * SD-LEO-INFRA-RELEASE-KEY-SESSION-001 — release_sd_by_key / retarget_sd_claim guards.
 *
 * Live-DB integration test, gated like the other tests/database suites so CI skips cleanly
 * without service-role creds. Modeled on tests/database/switch-sd-claim-guards.test.js:
 * hermetic per-run scratch SDs (RUN_SUFFIX) rather than any live-table candidate, so this suite
 * never races the concurrent fleet. Net-zero: every fixture row is inserted in beforeAll and
 * hard-deleted in afterAll.
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
const PROBE_SESSION = `test-release-by-key-session-${RUN_SUFFIX}`;
const KEY_A = `SD-TEST-RBK-A-${RUN_SUFFIX}`.toUpperCase(); // claude_sessions.sd_key pointer
const KEY_B = `SD-TEST-RBK-B-${RUN_SUFFIX}`.toUpperCase(); // secondary hold, released in TS-1
const KEY_C = `SD-TEST-RBK-C-${RUN_SUFFIX}`.toUpperCase(); // secondary hold, retarget source
const KEY_E = `SD-TEST-RBK-E-${RUN_SUFFIX}`.toUpperCase(); // fresh unclaimed retarget target
const KEY_TERMINAL = `SD-TEST-RBK-TERM-${RUN_SUFFIX}`.toUpperCase(); // terminal, retarget-claim failure

async function insertFixture(sdKey, { status = 'draft', claimed = false } = {}) {
  const { error } = await supabase.from('strategic_directives_v2').insert({
    sd_key: sdKey,
    id: sdKey,
    title: `TEST FIXTURE (SD-LEO-INFRA-RELEASE-KEY-SESSION-001): ${sdKey} — safe to delete`,
    description: 'Scratch SD created by tests/database/release-sd-by-key-guards.test.js; deleted in afterAll.',
    rationale: 'Test fixture — auto-cleaned',
    status,
    sd_type: 'bugfix',
    category: 'test_fixture',
    priority: 'low',
    ...(claimed ? { claiming_session_id: PROBE_SESSION, active_session_id: PROBE_SESSION, is_working_on: true } : {}),
  });
  return !error;
}

let fixturesReady = false;

describe.skipIf(!HAS_REAL_DB)('release_sd_by_key / retarget_sd_claim (SD-LEO-INFRA-RELEASE-KEY-SESSION-001)', () => {
  beforeAll(async () => {
    await supabase.from('claude_sessions').delete().eq('session_id', PROBE_SESSION);
    await supabase.from('claude_sessions').insert({
      session_id: PROBE_SESSION,
      sd_key: KEY_A,
      status: 'active',
      track: 'C',
    });
    const okA = await insertFixture(KEY_A, { claimed: true });
    const okB = await insertFixture(KEY_B, { claimed: true });
    const okC = await insertFixture(KEY_C, { claimed: true });
    const okE = await insertFixture(KEY_E, { status: 'draft', claimed: false });
    const okT = await insertFixture(KEY_TERMINAL, { status: 'completed', claimed: false });
    fixturesReady = okA && okB && okC && okE && okT;
  });

  afterAll(async () => {
    await supabase.from('claude_sessions').delete().eq('session_id', PROBE_SESSION);
    for (const key of [KEY_A, KEY_B, KEY_C, KEY_E, KEY_TERMINAL]) {
      await supabase.from('strategic_directives_v2').delete().eq('sd_key', key);
    }
  });

  it('release_sd_by_key on a SECONDARY held claim (KEY_B) releases only that row — pointer (KEY_A) and other secondary hold (KEY_C) untouched', async () => {
    if (!fixturesReady) return;
    const { data, error } = await supabase.rpc('release_sd_by_key', {
      p_session_id: PROBE_SESSION, p_sd_key: KEY_B, p_reason: 'test',
    });
    expect(error).toBeNull();
    expect(data?.success).toBe(true);
    expect(data?.released_sd_key).toBe(KEY_B);

    const { data: b } = await supabase.from('strategic_directives_v2')
      .select('claiming_session_id, active_session_id, is_working_on').eq('sd_key', KEY_B).maybeSingle();
    expect(b?.claiming_session_id).toBeNull();
    expect(b?.is_working_on).toBe(false);

    const { data: a } = await supabase.from('strategic_directives_v2')
      .select('claiming_session_id').eq('sd_key', KEY_A).maybeSingle();
    expect(a?.claiming_session_id).toBe(PROBE_SESSION);
    const { data: c } = await supabase.from('strategic_directives_v2')
      .select('claiming_session_id').eq('sd_key', KEY_C).maybeSingle();
    expect(c?.claiming_session_id).toBe(PROBE_SESSION);

    // Branch (b): claude_sessions untouched — still points at the pointer key.
    const { data: sess } = await supabase.from('claude_sessions')
      .select('sd_key').eq('session_id', PROBE_SESSION).maybeSingle();
    expect(sess?.sd_key).toBe(KEY_A);
  });

  it('release_sd_by_key on a key the session does not hold returns sd_mismatch and changes nothing', async () => {
    if (!fixturesReady) return;
    const { data, error } = await supabase.rpc('release_sd_by_key', {
      p_session_id: PROBE_SESSION, p_sd_key: KEY_E, p_reason: 'test',
    });
    expect(error).toBeNull();
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('sd_mismatch');
    expect(data?.held_sd_key).toBe(KEY_A);

    const { data: e } = await supabase.from('strategic_directives_v2')
      .select('claiming_session_id').eq('sd_key', KEY_E).maybeSingle();
    expect(e?.claiming_session_id).toBeNull();
  });

  it('release_sd_by_key on a phantom key returns sd_not_found', async () => {
    const { data, error } = await supabase.rpc('release_sd_by_key', {
      p_session_id: PROBE_SESSION, p_sd_key: 'SD-DOES-NOT-EXIST-PHANTOM-000', p_reason: 'test',
    });
    expect(error).toBeNull();
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('sd_not_found');
  });

  it('retarget_sd_claim with identical keys returns sd_same_key with zero effect', async () => {
    if (!fixturesReady) return;
    const { data, error } = await supabase.rpc('retarget_sd_claim', {
      p_session_id: PROBE_SESSION, p_release_sd_key: KEY_C, p_claim_sd_key: KEY_C, p_reason: 'test',
    });
    expect(error).toBeNull();
    expect(data?.success).toBe(false);
    expect(data?.error).toBe('sd_same_key');
    const { data: c } = await supabase.from('strategic_directives_v2')
      .select('claiming_session_id').eq('sd_key', KEY_C).maybeSingle();
    expect(c?.claiming_session_id).toBe(PROBE_SESSION); // still held — no effect
  });

  it('retarget_sd_claim releases KEY_C and claims KEY_E atomically', async () => {
    if (!fixturesReady) return;
    const { data, error } = await supabase.rpc('retarget_sd_claim', {
      p_session_id: PROBE_SESSION, p_release_sd_key: KEY_C, p_claim_sd_key: KEY_E, p_reason: 'test',
    });
    expect(error).toBeNull();
    expect(data?.success).toBe(true);
    expect(data?.released_sd_key).toBe(KEY_C);
    expect(data?.claimed_sd_key).toBe(KEY_E);

    const { data: c } = await supabase.from('strategic_directives_v2')
      .select('claiming_session_id').eq('sd_key', KEY_C).maybeSingle();
    expect(c?.claiming_session_id).toBeNull();
    const { data: e } = await supabase.from('strategic_directives_v2')
      .select('claiming_session_id').eq('sd_key', KEY_E).maybeSingle();
    expect(e?.claiming_session_id).toBe(PROBE_SESSION);
  });

  it('retarget_sd_claim rolls back the release when the claim side is refused (terminal target) — no partial state', async () => {
    if (!fixturesReady) return;
    // At this point the session holds KEY_A (pointer) and KEY_E (from the prior test).
    const { data, error } = await supabase.rpc('retarget_sd_claim', {
      p_session_id: PROBE_SESSION, p_release_sd_key: KEY_E, p_claim_sd_key: KEY_TERMINAL, p_reason: 'test',
    });
    expect(error).toBeNull();
    expect(data?.success).toBe(false);

    // ROLLBACK PROOF: KEY_E must still be held (the release was undone), and KEY_TERMINAL must
    // still be unclaimed (the claim never took effect) — the exact atomicity guarantee FR-2 exists for.
    const { data: e } = await supabase.from('strategic_directives_v2')
      .select('claiming_session_id').eq('sd_key', KEY_E).maybeSingle();
    expect(e?.claiming_session_id).toBe(PROBE_SESSION);
    const { data: t } = await supabase.from('strategic_directives_v2')
      .select('claiming_session_id').eq('sd_key', KEY_TERMINAL).maybeSingle();
    expect(t?.claiming_session_id).toBeNull();
  });
});
