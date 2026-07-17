/**
 * phantom-session-reap.integration.test.js — SD-LEO-INFRA-BLOCK-TEST-SESSION-001 (FR-2/FR-3)
 *
 * Drives the REAL reapPhantomSessionClaims pass (exported from stale-session-sweep.cjs)
 * against REAL tables — no mocked gate (test-masking lesson: mocking the gate ships green
 * on dead code). Covers: a genuinely orphaned claim gets released + audited; the
 * cross-signal guard refuses to reap when a DIFFERENT live session references the SD via
 * active_session_id; a claim held by a live registered session is left untouched; the
 * pass is idempotent across two runs.
 *
 * Isolation: every fixture id carries a unique per-run RUN_ID, cleaned in afterAll.
 * Fixture SD keys deliberately do NOT match TEST_FIXTURE_KEY_RE (SD-/DEMO-/TEST- prefix)
 * so reapPhantomSessionClaims's own fixture-key exclusion does not skip them.
 *
 * LIVE-gated: skips (not fails) without Supabase creds so hermetic CI stays green.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const HAS_DB = !!((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
  && process.env.SUPABASE_SERVICE_ROLE_KEY);

const RUN_ID = `${Date.now()}-${process.pid}`;
const SD_PHANTOM_ONLY = `SD-PHANTOMREAP-ONLY-${RUN_ID}`;
const SD_CROSS_SIGNAL = `SD-PHANTOMREAP-XSIG-${RUN_ID}`;
const SD_LIVE_CLAIM = `SD-PHANTOMREAP-LIVE-${RUN_ID}`;
const PHANTOM_ID_A = `phantomreap-phantom-a-${RUN_ID}`; // never inserted into claude_sessions
const PHANTOM_ID_B = `phantomreap-phantom-b-${RUN_ID}`; // never inserted into claude_sessions
const LIVE_SESSION = `phantomreap-live-session-${RUN_ID}`; // real registered session

describe.skipIf(!HAS_DB)('reapPhantomSessionClaims (LIVE tables, ephemeral fixtures)', () => {
  let sb;
  let reapPhantomSessionClaims;

  function fixtureSd(key, { claiming_session_id, active_session_id, is_working_on }) {
    return {
      id: crypto.randomUUID(),
      sd_key: key,
      title: `[fixture] phantom-reap integration test ${RUN_ID}`,
      description: 'Ephemeral integration fixture — safe to delete on sight.',
      rationale: 'FR-2/FR-3 live phantom-reap coverage.',
      status: 'draft',
      current_phase: 'LEAD',
      sd_type: 'infrastructure',
      category: 'Infrastructure',
      priority: 'low',
      scope: 'ephemeral test fixture',
      target_application: 'EHG_Engineer',
      success_criteria: [{ criterion: 'fixture', measure: 'n/a' }],
      claiming_session_id,
      active_session_id,
      is_working_on,
    };
  }

  beforeAll(async () => {
    const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
    sb = createSupabaseServiceClient();
    ({ reapPhantomSessionClaims } = require('../../scripts/stale-session-sweep.cjs'));

    await sb.from('claude_sessions').upsert({
      session_id: LIVE_SESSION,
      status: 'active',
      heartbeat_at: new Date().toISOString(),
      machine_id: 'test-machine',
      terminal_id: `test-${LIVE_SESSION}`,
      hostname: 'test-host',
      codebase: 'EHG_Engineer',
    }, { onConflict: 'session_id' });

    const { error: sdErr } = await sb.from('strategic_directives_v2').insert([
      fixtureSd(SD_PHANTOM_ONLY, { claiming_session_id: PHANTOM_ID_A, active_session_id: PHANTOM_ID_A, is_working_on: true }),
      fixtureSd(SD_CROSS_SIGNAL, { claiming_session_id: PHANTOM_ID_B, active_session_id: LIVE_SESSION, is_working_on: true }),
      fixtureSd(SD_LIVE_CLAIM, { claiming_session_id: LIVE_SESSION, active_session_id: LIVE_SESSION, is_working_on: true }),
    ]);
    expect(sdErr, `strategic_directives_v2 fixture insert: ${sdErr?.message}`).toBeNull();
  }, 30000);

  afterAll(async () => {
    await sb.from('strategic_directives_v2').delete().in('sd_key', [SD_PHANTOM_ONLY, SD_CROSS_SIGNAL, SD_LIVE_CLAIM]);
    await sb.from('claude_sessions').delete().eq('session_id', LIVE_SESSION);
    await sb.from('session_lifecycle_events').delete().in('session_id', [PHANTOM_ID_A, PHANTOM_ID_B]);
  }, 30000);

  async function getSdClaimState(key) {
    const { data } = await sb.from('strategic_directives_v2')
      .select('claiming_session_id, active_session_id, is_working_on').eq('sd_key', key).single();
    return data;
  }

  it('TS-5: reaps a genuinely orphaned claim, co-nulling all three claim columns, and audits it', async () => {
    const actions = [];
    const warnings = [];
    await reapPhantomSessionClaims(sb, { actions, warnings });

    const after = await getSdClaimState(SD_PHANTOM_ONLY);
    expect(after.claiming_session_id).toBeNull();
    expect(after.active_session_id).toBeNull();
    expect(after.is_working_on).toBe(false);
    expect(actions.some((a) => a.includes(SD_PHANTOM_ONLY))).toBe(true);

    const { data: events } = await sb.from('session_lifecycle_events')
      .select('event_type, metadata').eq('session_id', PHANTOM_ID_A);
    expect(events.some((e) => e.event_type === 'PHANTOM_CLAIM_REAPED' && e.metadata?.sd_key === SD_PHANTOM_ONLY)).toBe(true);
  }, 20000);

  it('TS-6/cross-signal: does NOT reap when active_session_id points to a DIFFERENT live session', async () => {
    const actions = [];
    const warnings = [];
    await reapPhantomSessionClaims(sb, { actions, warnings });

    const after = await getSdClaimState(SD_CROSS_SIGNAL);
    expect(after.claiming_session_id).toBe(PHANTOM_ID_B); // untouched — cross-signal guard fired
    expect(after.active_session_id).toBe(LIVE_SESSION);
    expect(warnings.some((w) => w.includes(SD_CROSS_SIGNAL))).toBe(true);

    const { data: events } = await sb.from('session_lifecycle_events')
      .select('id').eq('session_id', PHANTOM_ID_B);
    expect(events.length).toBe(0); // no audit row for a claim that was not reaped
  }, 20000);

  it('TS-7: leaves a claim held by a live registered session untouched', async () => {
    const actions = [];
    const warnings = [];
    await reapPhantomSessionClaims(sb, { actions, warnings });

    const after = await getSdClaimState(SD_LIVE_CLAIM);
    expect(after.claiming_session_id).toBe(LIVE_SESSION);
    expect(after.is_working_on).toBe(true);
  }, 20000);

  it('TS-8: idempotent — a second run finds nothing left to reap for the already-cleared SD', async () => {
    const actionsFirst = [];
    await reapPhantomSessionClaims(sb, { actions: actionsFirst, warnings: [] });
    expect(actionsFirst.some((a) => a.includes(SD_PHANTOM_ONLY))).toBe(false); // already cleared by TS-5

    const actionsSecond = [];
    await reapPhantomSessionClaims(sb, { actions: actionsSecond, warnings: [] });
    expect(actionsSecond.some((a) => a.includes(SD_PHANTOM_ONLY))).toBe(false);

    const { data: events } = await sb.from('session_lifecycle_events')
      .select('id').eq('session_id', PHANTOM_ID_A);
    expect(events.length).toBe(1); // still exactly one audit row from the original TS-5 reap
  }, 20000);
});
