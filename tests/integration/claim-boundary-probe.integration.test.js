/**
 * claim-boundary-probe.integration.test.js — SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001
 * (TS-1, TS-2, TS-3, TS-4 + alert dedup).
 *
 * Drives the REAL detect→release→quarantine→alert loop (runClaimBoundaryProbe,
 * exported from stale-session-sweep.cjs) against REAL tables — release_sd RPC,
 * quick_fixes guarded reset, claude_sessions metadata quarantine, and the
 * session_coordination operator line all execute for real. NO MOCKED GATE
 * (test-masking lesson: mocking the gate ships green on dead code).
 *
 * Isolation contract (ephemeral fixtures, zero prod leak):
 *   - Every fixture id carries a unique per-run RUN_ID (timestamp+pid), cleaned in
 *     afterAll with a zero-survivors assertion.
 *   - The fixture QF is seeded routing_tier=3, which isAutoStartableQF refuses —
 *     so even in its seconds-long post-release status='open' window no live
 *     worker's checkin picker can claim it.
 *   - Fixture sessions are inserted released-shaped only via this suite's inputs;
 *     the probe receives its `classified` array explicitly (exactly the fields
 *     main() passes), so no other live session is ever touched.
 *
 * LIVE-gated: skips (not fails) without Supabase creds so hermetic CI stays green.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const HAS_DB = !!((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
  && process.env.SUPABASE_SERVICE_ROLE_KEY);

const RUN_ID = `cbp-test-${Date.now()}-${process.pid}`;
const SID_MISS = `${RUN_ID}-miss`;
const SID_PASS = `${RUN_ID}-pass`;
const SID_UNKNOWN = `${RUN_ID}-unknown`;
const SID_SD_MISS = `${RUN_ID}-sdmiss`;
const QF_MISS = `QF-TEST-CBP-${Date.now()}${process.pid}A`;
const QF_PASS = `QF-TEST-CBP-${Date.now()}${process.pid}B`;
const QF_UNKNOWN = `QF-TEST-CBP-${Date.now()}${process.pid}C`;
// SD-TEST- namespace: the sweep's QA mutation paths are hard-fenced from it
// (TEST_FIXTURE_SD_KEY_LIKE), and a FRESH updated_at keeps adoptOrphanInProgress
// (15-min minimum age) away during the seconds this fixture lives.
const SD_MISS = `SD-TEST-CBP-${Date.now()}${process.pid}`;

const MIN = 60_000;

describe.skipIf(!HAS_DB)('claim-boundary probe (LIVE tables, ephemeral fixtures)', () => {
  let sb;
  let runClaimBoundaryProbe;
  let checkin;

  const nowMs = Date.now();
  const claimedAtIso = new Date(nowMs - 20 * MIN).toISOString();
  const lastToolBoundaryIso = new Date(nowMs - 20 * MIN + 5_000).toISOString();

  function fixtureSession(sessionId, sdKey, lastToolAt) {
    return {
      session_id: sessionId,
      status: 'active',
      sd_key: sdKey,
      claimed_at: claimedAtIso,
      heartbeat_at: new Date(nowMs).toISOString(), // fresh — the freeze signature
      last_tool_at: lastToolAt,
      terminal_id: `win-cc-9999-${sessionId.slice(-6)}`,
      tty: 'win-99999',
      hostname: 'cbp-test-host',
      metadata: {},
    };
  }

  function fixtureQf(id) {
    return {
      id,
      title: `[fixture] claim-boundary probe test ${RUN_ID}`,
      description: 'Ephemeral integration fixture — safe to delete on sight.',
      status: 'in_progress',
      severity: 'low',
      routing_tier: 3, // isAutoStartableQF refuses tier>=3 — no live worker can claim it
      type: 'bug',
    };
  }

  /** classified/telemetryMap inputs exactly as main() constructs them. */
  function probeInputs(rows) {
    const classified = rows.map(r => ({
      session_id: r.session_id, sd_key: r.sd_key, is_virtual: false,
      terminal_id: r.terminal_id, tty: r.tty, status: 'ACTIVE',
    }));
    const telemetryMap = new Map(rows.map(r => [r.session_id, {
      session_id: r.session_id,
      last_tool_at: r.last_tool_at,
      claimed_at: r.claimed_at,
      metadata: r.metadata,
      expected_silence_until: null,
      current_tool_expected_end_at: null,
      worktree_path: null,
    }]));
    return { classified, telemetryMap };
  }

  beforeAll(async () => {
    const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
    sb = createSupabaseServiceClient();
    ({ runClaimBoundaryProbe } = require('../../scripts/stale-session-sweep.cjs'));
    checkin = require('../../scripts/worker-checkin.cjs');

    const { error: qfErr } = await sb.from('quick_fixes').insert([
      { ...fixtureQf(QF_MISS), claiming_session_id: SID_MISS },
      { ...fixtureQf(QF_PASS), claiming_session_id: SID_PASS },
      { ...fixtureQf(QF_UNKNOWN), claiming_session_id: SID_UNKNOWN },
    ]);
    expect(qfErr, `quick_fixes fixture insert: ${qfErr?.message}`).toBeNull();

    // TS-7: an SD-shaped claim so the SD release half (three-column clear +
    // re-adoptability shape) is asserted live, not inferred from the QF path.
    const { error: sdErr } = await sb.from('strategic_directives_v2').insert({
      id: crypto.randomUUID(),
      sd_key: SD_MISS,
      title: `[fixture] claim-boundary probe SD release test ${RUN_ID}`,
      description: 'Ephemeral integration fixture — safe to delete on sight.',
      rationale: 'TS-7 live SD-release coverage (claim-boundary probe).',
      status: 'in_progress',
      current_phase: 'EXEC',
      sd_type: 'infrastructure',
      category: 'Infrastructure',
      priority: 'low',
      scope: 'ephemeral test fixture',
      target_application: 'EHG_Engineer',
      success_criteria: [{ criterion: 'fixture', measure: 'n/a' }],
      claiming_session_id: SID_SD_MISS,
      active_session_id: SID_SD_MISS,
      is_working_on: true,
    });
    expect(sdErr, `strategic_directives_v2 fixture insert: ${sdErr?.message}`).toBeNull();

    const { error: sessErr } = await sb.from('claude_sessions').insert([
      fixtureSession(SID_MISS, QF_MISS, lastToolBoundaryIso),          // froze at the boundary
      fixtureSession(SID_PASS, QF_PASS, new Date(nowMs - 2 * MIN).toISOString()), // active worker
      fixtureSession(SID_UNKNOWN, QF_UNKNOWN, null),                   // pre-rollout hook
      fixtureSession(SID_SD_MISS, SD_MISS, lastToolBoundaryIso),       // SD-claim freeze (TS-7)
    ]);
    expect(sessErr, `claude_sessions fixture insert: ${sessErr?.message}`).toBeNull();
  }, 30_000);

  afterAll(async () => {
    if (!sb) return;
    await sb.from('session_coordination').delete().eq('payload->>kind', 'claim_boundary_released')
      .in('payload->>session_id', [SID_MISS, SID_PASS, SID_UNKNOWN, SID_SD_MISS]);
    await sb.from('quick_fixes').delete().in('id', [QF_MISS, QF_PASS, QF_UNKNOWN]);
    await sb.from('strategic_directives_v2').delete().eq('sd_key', SD_MISS);
    await sb.from('claude_sessions').delete().like('session_id', `${RUN_ID}%`);
    // Zero-survivors: nothing this run seeded may outlive it.
    const { count: sessLeft } = await sb.from('claude_sessions')
      .select('session_id', { count: 'exact', head: true }).like('session_id', `${RUN_ID}%`);
    const { count: qfLeft } = await sb.from('quick_fixes')
      .select('id', { count: 'exact', head: true }).in('id', [QF_MISS, QF_PASS, QF_UNKNOWN]);
    const { count: sdLeft } = await sb.from('strategic_directives_v2')
      .select('sd_key', { count: 'exact', head: true }).eq('sd_key', SD_MISS);
    expect(sessLeft ?? 0).toBe(0);
    expect(qfLeft ?? 0).toBe(0);
    expect(sdLeft ?? 0).toBe(0);
  }, 30_000);

  it('TS-1 MISS: releases via release_sd, resets the QF to open, quarantines, emits ONE operator line; TS-2/TS-3 untouched', async () => {
    const { data: rows } = await sb.from('claude_sessions')
      .select('session_id, sd_key, claimed_at, last_tool_at, terminal_id, tty, metadata')
      .in('session_id', [SID_MISS, SID_PASS, SID_UNKNOWN]); // TS-7's SD fixture runs in its own test
    expect(rows).toHaveLength(3);

    const { classified, telemetryMap } = probeInputs(rows);
    const actions = [];
    const warnings = [];
    const outcomes = await runClaimBoundaryProbe(sb, classified, telemetryMap, new Date(), actions, warnings);

    const byId = Object.fromEntries(outcomes.map(o => [o.session_id, o]));
    expect(byId[SID_MISS]).toMatchObject({ verdict: 'MISS', reason: 'zero_activity_since_boundary' });
    expect(byId[SID_PASS]).toMatchObject({ verdict: 'PASS' });
    expect(byId[SID_UNKNOWN]).toMatchObject({ verdict: 'UNKNOWN', reason: 'last_tool_at_never_written' });

    // Release went through the real release_sd RPC (the manual fence's path).
    const { data: missSession } = await sb.from('claude_sessions')
      .select('sd_key, status, released_reason, metadata').eq('session_id', SID_MISS).maybeSingle();
    expect(missSession.sd_key).toBeNull();
    expect(missSession.status).toBe('idle'); // release_sd sets status='idle'
    expect(missSession.released_reason).toBe('CLAIM_BOUNDARY_PROBE');

    // QF supplement: back on the belt where the checkin picker can SEE it (AC-6).
    const { data: missQf } = await sb.from('quick_fixes')
      .select('status, claiming_session_id').eq('id', QF_MISS).maybeSingle();
    expect(missQf.status).toBe('open');
    expect(missQf.claiming_session_id).toBeNull();

    // Quarantine flag: QF-193 provenance convention (AC-3 precondition).
    const q = missSession.metadata?.quarantine;
    expect(q).toBeTruthy();
    expect(q.set_by).toBe('claim-boundary-probe');
    expect(q.set_at).toBeTruthy();
    expect(q.released_sd).toBe(QF_MISS);
    expect(q.evidence).toBeTruthy(); // full signal snapshot at decision time (AC-4)
    expect(q.cleared_at).toBeUndefined();

    // ONE operator line naming the terminal (AC-1/AC-4), broadcast-coordinator target.
    const { data: alerts } = await sb.from('session_coordination')
      .select('subject, body, target_session, payload')
      .eq('payload->>kind', 'claim_boundary_released').eq('payload->>session_id', SID_MISS);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].target_session).toBe('broadcast-coordinator');
    expect(alerts[0].subject).toContain(QF_MISS);
    expect(alerts[0].subject).toContain(rows.find(r => r.session_id === SID_MISS).terminal_id);
    expect(alerts[0].payload.evidence).toBeTruthy();

    // TS-2 PASS fixture untouched: claim intact, no quarantine, no alert.
    const { data: passSession } = await sb.from('claude_sessions')
      .select('sd_key, metadata').eq('session_id', SID_PASS).maybeSingle();
    expect(passSession.sd_key).toBe(QF_PASS);
    expect(passSession.metadata?.quarantine).toBeUndefined();
    const { data: passQf } = await sb.from('quick_fixes').select('status').eq('id', QF_PASS).maybeSingle();
    expect(passQf.status).toBe('in_progress');

    // TS-3 UNKNOWN fixture untouched (fail-open, never release on missing signal).
    const { data: unknownSession } = await sb.from('claude_sessions')
      .select('sd_key, metadata').eq('session_id', SID_UNKNOWN).maybeSingle();
    expect(unknownSession.sd_key).toBe(QF_UNKNOWN);
    expect(unknownSession.metadata?.quarantine).toBeUndefined();

    expect(actions.some(a => a.includes('CLAIM_BOUNDARY_PROBE') && a.includes(QF_MISS))).toBe(true);
  }, 60_000);

  it('TS-7 SD-claim MISS: release_sd three-column clear + re-adoptability shape + phase reset attempt', async () => {
    const { data: rows } = await sb.from('claude_sessions')
      .select('session_id, sd_key, claimed_at, last_tool_at, terminal_id, tty, metadata')
      .eq('session_id', SID_SD_MISS);
    expect(rows).toHaveLength(1);

    const { classified, telemetryMap } = probeInputs(rows);
    const actions = [];
    const outcomes = await runClaimBoundaryProbe(sb, classified, telemetryMap, new Date(), actions, []);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ verdict: 'MISS', sd_key: SD_MISS });

    // Three-column dual-column-atomicity invariant on the SD row (AC-6).
    const { data: sdRow } = await sb.from('strategic_directives_v2')
      .select('status, claiming_session_id, active_session_id, is_working_on')
      .eq('sd_key', SD_MISS).maybeSingle();
    expect(sdRow.claiming_session_id).toBeNull();
    expect(sdRow.active_session_id).toBeNull();
    expect(sdRow.is_working_on).toBe(false);
    // Re-adoptability shape: adoptOrphanInProgress targets in_progress + claiming NULL
    // (age-gated at 15min, which is why this fixture is safe to leave for seconds).
    expect(sdRow.status).toBe('in_progress');

    // Session released through the same fence path as the QF case.
    const { data: sess } = await sb.from('claude_sessions')
      .select('sd_key, status, released_reason, metadata').eq('session_id', SID_SD_MISS).maybeSingle();
    expect(sess.sd_key).toBeNull();
    expect(sess.released_reason).toBe('CLAIM_BOUNDARY_PROBE');
    expect(sess.metadata?.quarantine?.released_sd).toBe(SD_MISS);

    // Its own operator line, de-duped per session.
    const { data: alerts } = await sb.from('session_coordination')
      .select('subject').eq('payload->>kind', 'claim_boundary_released').eq('payload->>session_id', SID_SD_MISS);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].subject).toContain(SD_MISS);
  }, 60_000);

  it('second pass: uncleaned quarantine short-circuits — no re-release, no duplicate alert', async () => {
    const { data: rows } = await sb.from('claude_sessions')
      .select('session_id, sd_key, claimed_at, last_tool_at, terminal_id, tty, metadata')
      .eq('session_id', SID_MISS);
    // Re-present the released session AS IF still claimed (worst-case stale sweep input).
    rows[0].sd_key = QF_MISS;
    const { classified, telemetryMap } = probeInputs(rows);
    const outcomes = await runClaimBoundaryProbe(sb, classified, telemetryMap, new Date(), [], []);
    expect(outcomes).toHaveLength(0); // quarantine skip — never re-processed

    const { data: alerts } = await sb.from('session_coordination')
      .select('id').eq('payload->>kind', 'claim_boundary_released').eq('payload->>session_id', SID_MISS);
    expect(alerts).toHaveLength(1); // still exactly one
  }, 30_000);

  it('TS-4 re-entry: checkin self-clears the quarantine, re-enabling self-claim, history retained', async () => {
    const { data: before } = await sb.from('claude_sessions')
      .select('metadata').eq('session_id', SID_MISS).maybeSingle();
    expect(checkin.isQuarantined(before.metadata)).toBe(true);
    expect(checkin.isSelfClaimDisabled(before.metadata)).toBe(true);

    const cleared = await checkin.selfClearQuarantine(sb, SID_MISS, before.metadata);
    expect(checkin.isQuarantined(cleared)).toBe(false);
    expect(checkin.isSelfClaimDisabled(cleared)).toBe(false);

    // Durable + history retained (cleared_at stamped, object not deleted).
    const { data: after } = await sb.from('claude_sessions')
      .select('metadata').eq('session_id', SID_MISS).maybeSingle();
    expect(after.metadata.quarantine.cleared_at).toBeTruthy();
    expect(after.metadata.quarantine.cleared_by).toBe('worker_checkin_self_clear');
    expect(after.metadata.quarantine.set_by).toBe('claim-boundary-probe');

    // Idempotent: second clear is a no-op that stays cleared.
    const again = await checkin.selfClearQuarantine(sb, SID_MISS, after.metadata);
    expect(checkin.isQuarantined(again)).toBe(false);
  }, 30_000);

  it('pre-release re-verification: resumed tool activity since the snapshot aborts the release (race guard)', async () => {
    // Adversarial-review race (PR #5622): probe decided MISS from a stale snapshot,
    // but the operator answered the prompt and the worker resumed before release.
    // Simulate: DB row has FRESH last_tool_at; the probe's telemetryMap carries the
    // STALE boundary-era value. The MISS must abort — claim untouched.
    await sb.from('claude_sessions')
      .update({ last_tool_at: new Date().toISOString() })
      .eq('session_id', SID_UNKNOWN);
    const staleTelemetry = new Map([[SID_UNKNOWN, {
      session_id: SID_UNKNOWN,
      last_tool_at: lastToolBoundaryIso, // stale snapshot: froze at the boundary
      claimed_at: claimedAtIso,
      metadata: {},
      expected_silence_until: null,
      current_tool_expected_end_at: null,
    }]]);
    const classified = [{ session_id: SID_UNKNOWN, sd_key: QF_UNKNOWN, is_virtual: false, terminal_id: 't', tty: 't', status: 'ACTIVE' }];
    const actions = [];
    const outcomes = await runClaimBoundaryProbe(sb, classified, staleTelemetry, new Date(), actions, []);
    expect(outcomes[0]?.verdict).toBe('MISS'); // predicate said MISS from the snapshot…
    const { data: sess } = await sb.from('claude_sessions')
      .select('sd_key, metadata').eq('session_id', SID_UNKNOWN).maybeSingle();
    expect(sess.sd_key).toBe(QF_UNKNOWN); // …but the live re-read aborted the release
    expect(sess.metadata?.quarantine).toBeUndefined();
    expect(actions.some(a => a.includes('release aborted') && a.includes('tool activity resumed'))).toBe(true);
  }, 30_000);

  it('pre-release re-verification: claim changed since the snapshot aborts the release', async () => {
    // Session re-claimed a DIFFERENT item in the gap — release_sd is session-keyed and
    // would release the NEW live claim; the sd_key mismatch must abort.
    const staleTelemetry = new Map([[SID_UNKNOWN, {
      session_id: SID_UNKNOWN,
      last_tool_at: lastToolBoundaryIso,
      claimed_at: claimedAtIso,
      metadata: {},
      expected_silence_until: null,
      current_tool_expected_end_at: null,
    }]]);
    // Present the probe a DIFFERENT detected sd_key than the row's live one.
    const classified = [{ session_id: SID_UNKNOWN, sd_key: 'QF-TEST-CBP-GONE-STALE', is_virtual: false, terminal_id: 't', tty: 't', status: 'ACTIVE' }];
    // Restore a stale last_tool_at on the row so only the sd_key guard can abort.
    await sb.from('claude_sessions')
      .update({ last_tool_at: lastToolBoundaryIso })
      .eq('session_id', SID_UNKNOWN);
    const actions = [];
    await runClaimBoundaryProbe(sb, classified, staleTelemetry, new Date(), actions, []);
    const { data: sess } = await sb.from('claude_sessions')
      .select('sd_key').eq('session_id', SID_UNKNOWN).maybeSingle();
    expect(sess.sd_key).toBe(QF_UNKNOWN); // live claim untouched
    expect(actions.some(a => a.includes('release aborted') && a.includes('claim changed'))).toBe(true);
  }, 30_000);

  it('kill-switch: CLAIM_BOUNDARY_PROBE_ENABLED=false disables the pass entirely', async () => {
    const { data: rows } = await sb.from('claude_sessions')
      .select('session_id, sd_key, claimed_at, last_tool_at, terminal_id, tty, metadata')
      .eq('session_id', SID_UNKNOWN);
    const { classified, telemetryMap } = probeInputs(rows);
    const outcomes = await runClaimBoundaryProbe(sb, classified, telemetryMap, new Date(), [], [],
      { env: { CLAIM_BOUNDARY_PROBE_ENABLED: 'false' } });
    expect(outcomes).toHaveLength(0);
  }, 30_000);
});
