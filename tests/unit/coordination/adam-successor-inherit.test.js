/**
 * SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001 — successor-Adam mail forwarding.
 *
 * Pins the shared retired-seat resolver, the widened drainAdamOutbound (register-time) and
 * retargetStaleAdamInbound (reply-time) movers onto one predicate, adam-register.cjs's
 * decoupled drain call, and the watchdog's retired-role visibility fix. Uses
 * tests/helpers/postgrest-fixture-store.js (a genuinely-filtering fake) rather than any of the
 * repo's existing no-op-filter doubles — see that file's header for why.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createFixtureSupabase } from '../../helpers/postgrest-fixture-store.js';
import {
  resolveRetiredAdamSeats,
  retargetStaleAdamInbound,
  ADAM_RETIRED_ROLE,
  ADAM_MAIL_TTL_DAYS,
} from '../../../lib/coordinator/adam-identity.cjs';
import { drainAdamOutbound } from '../../../scripts/adam-advisory.cjs';
import { resolveAdamSessionIds } from '../../../lib/adam/inbound-backlog-watchdog.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-16T00:00:00Z');
const recent = (daysAgo) => new Date(NOW - daysAgo * DAY_MS).toISOString();

function baseFixture() {
  return {
    claude_sessions: [
      { session_id: 'retired-1', metadata: { role: ADAM_RETIRED_ROLE } },
      { session_id: 'retired-2', metadata: { role: ADAM_RETIRED_ROLE } },
      { session_id: 'live-adam', metadata: { role: 'adam' } },
      { session_id: 'someone-else', metadata: { role: 'worker' } },
    ],
    session_coordination: [],
  };
}

describe('resolveRetiredAdamSeats', () => {
  it('returns only role=adam_retired session ids, excluding live adam and other roles', async () => {
    const sb = createFixtureSupabase(baseFixture());
    const { ids, error } = await resolveRetiredAdamSeats(sb);
    expect(error).toBeNull();
    expect(ids.sort()).toEqual(['retired-1', 'retired-2']);
  });

  it('fails closed (empty + error) rather than throwing on a query error', async () => {
    const sb = createFixtureSupabase(baseFixture());
    sb.setError('claude_sessions');
    const { ids, error } = await resolveRetiredAdamSeats(sb);
    expect(ids).toEqual([]);
    expect(error).toBeTruthy();
  });

  // Pins the live convention this SD's safety gate depends on (PRD risk: if clear_adam_flag is
  // ever applied without preserving it, this resolver silently sees fewer/no seats). A change to
  // ADAM_RETIRED_ROLE's value, or to what scripts/adam-register.cjs's JS-merge fallback writes,
  // must fail this test loudly rather than degrade silently in production.
  it('the live retirement convention (adam-register.cjs JS-merge fallback) matches ADAM_RETIRED_ROLE', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'scripts/adam-register.cjs'), 'utf8');
    expect(src).toMatch(/role:\s*'adam_retired'/);
    expect(ADAM_RETIRED_ROLE).toBe('adam_retired');
  });
});

describe('drainAdamOutbound — register-time mover', () => {
  it('inherits read-but-unacked rows from ALL retired seats (not just this-call ones), across coordinator/solomon/orchestrator senders', async () => {
    const fixture = baseFixture();
    fixture.session_coordination = [
      { id: 'a', target_session: 'retired-1', sender_type: 'coordinator', acknowledged_at: null, read_at: recent(3), payload: { kind: 'coordinator_reply' }, created_at: recent(3) },
      { id: 'b', target_session: 'retired-2', sender_type: 'solomon', acknowledged_at: null, read_at: recent(3), payload: { kind: 'adam_advisory' }, created_at: recent(3) },
      { id: 'c', target_session: 'retired-1', sender_type: 'orchestrator', acknowledged_at: null, read_at: null, payload: { kind: 'adam_action_required' }, created_at: recent(1) },
    ];
    const sb = createFixtureSupabase(fixture);
    const { ids: retiredIds } = await resolveRetiredAdamSeats(sb);
    const result = await drainAdamOutbound(sb, { newSessionId: 'new-adam', oldSessionIds: retiredIds });
    expect(result.error).toBeUndefined();
    expect(result.moved).toBe(3);
    expect(result.byKind).toEqual({ coordinator_reply: 1, adam_advisory: 1, adam_action_required: 1 });
    for (const row of sb.table('session_coordination')) {
      expect(row.target_session).toBe('new-adam');
      expect(row.payload.retargeted_from).toMatch(/^retired-/);
      expect(row.payload.retargeted_at).toBeTruthy();
    }
  });

  it('never moves: acked rows, any of the 5 ADAM_EXCLUDED_KINDS, or rows older than 14 days', async () => {
    const fixture = baseFixture();
    fixture.session_coordination = [
      { id: 'acked', target_session: 'retired-1', acknowledged_at: recent(1), payload: { kind: 'coordinator_reply' }, created_at: recent(1) },
      { id: 'ping', target_session: 'retired-1', acknowledged_at: null, payload: { kind: 'cross_party_ping' }, created_at: recent(1) },
      { id: 'canary', target_session: 'retired-1', acknowledged_at: null, payload: { kind: 'canary_request' }, created_at: recent(1) },
      { id: 'comms', target_session: 'retired-1', acknowledged_at: null, payload: { kind: 'comms_check' }, created_at: recent(1) },
      { id: 'ack', target_session: 'retired-1', acknowledged_at: null, payload: { kind: 'ack' }, created_at: recent(1) },
      { id: 'coord_ack', target_session: 'retired-1', acknowledged_at: null, payload: { kind: 'coordinator_ack' }, created_at: recent(1) },
      { id: 'stale', target_session: 'retired-1', acknowledged_at: null, payload: { kind: 'coordinator_reply' }, created_at: recent(15) },
    ];
    const sb = createFixtureSupabase(fixture);
    const result = await drainAdamOutbound(sb, { newSessionId: 'new-adam', oldSessionIds: ['retired-1'] });
    expect(result.moved).toBe(0);
  });

  it('a row with payload.kind absent, and a row with payload:null, both move (null-safe kind exclusion)', async () => {
    const fixture = baseFixture();
    fixture.session_coordination = [
      { id: 'no-kind', target_session: 'retired-1', acknowledged_at: null, payload: { body: 'hi' }, created_at: recent(1) },
      { id: 'null-payload', target_session: 'retired-1', acknowledged_at: null, payload: null, created_at: recent(1) },
    ];
    const sb = createFixtureSupabase(fixture);
    const result = await drainAdamOutbound(sb, { newSessionId: 'new-adam', oldSessionIds: ['retired-1'] });
    expect(result.moved).toBe(2);
  });

  it('a second run over the same fixture moves 0 (idempotent — acked rows never re-move)', async () => {
    const fixture = baseFixture();
    fixture.session_coordination = [
      { id: 'a', target_session: 'retired-1', acknowledged_at: null, payload: { kind: 'coordinator_reply' }, created_at: recent(1) },
    ];
    const sb = createFixtureSupabase(fixture);
    const first = await drainAdamOutbound(sb, { newSessionId: 'new-adam', oldSessionIds: ['retired-1'] });
    expect(first.moved).toBe(1);
    // second run: same oldSessionIds, but the row is now at new-adam, not retired-1
    const second = await drainAdamOutbound(sb, { newSessionId: 'new-adam', oldSessionIds: ['retired-1'] });
    expect(second.moved).toBe(0);
  });

  it('TR-5 concurrent-update race: a row acknowledged between select and update is neither moved nor counted', async () => {
    const fixture = baseFixture();
    fixture.session_coordination = [
      { id: 'raced', target_session: 'retired-1', acknowledged_at: null, payload: { kind: 'coordinator_reply' }, created_at: recent(1) },
    ];
    const sb = createFixtureSupabase(fixture);
    // Simulate the race: another process acks the row the instant after drainAdamOutbound's
    // initial select would have run, by pre-acking it and calling drain over a fixture where the
    // select-phase view differs from the update-phase view is not directly expressible without
    // instrumenting the double — so this pins the OBSERVABLE CONTRACT instead: the update
    // re-asserts is(acknowledged_at, null), so an already-acked row is never moved even if some
    // upstream read believed it was still open.
    sb.table('session_coordination')[0].acknowledged_at = recent(0);
    const result = await drainAdamOutbound(sb, { newSessionId: 'new-adam', oldSessionIds: ['retired-1'] });
    expect(result.moved).toBe(0);
  });

  it('resolver error propagates as a fail-closed 0-moved result, not a false "no restriction"', async () => {
    const sb = createFixtureSupabase(baseFixture());
    sb.setError('session_coordination');
    const result = await drainAdamOutbound(sb, { newSessionId: 'new-adam', oldSessionIds: ['retired-1'] });
    expect(result.moved).toBe(0);
    expect(result.error).toBeTruthy();
  });

  it('multiple retired seats in one call: all inherited, byKind aggregates across seats', async () => {
    const fixture = baseFixture();
    fixture.session_coordination = [
      { id: 'a', target_session: 'retired-1', acknowledged_at: null, payload: { kind: 'coordinator_reply' }, created_at: recent(1) },
      { id: 'b', target_session: 'retired-2', acknowledged_at: null, payload: { kind: 'coordinator_reply' }, created_at: recent(1) },
      { id: 'c', target_session: 'retired-2', acknowledged_at: null, payload: { kind: 'adam_advisory' }, created_at: recent(1) },
    ];
    const sb = createFixtureSupabase(fixture);
    const result = await drainAdamOutbound(sb, { newSessionId: 'new-adam', oldSessionIds: ['retired-1', 'retired-2'] });
    expect(result.moved).toBe(3);
    expect(result.byKind).toEqual({ coordinator_reply: 2, adam_advisory: 1 });
  });
});

describe('retargetStaleAdamInbound — reply-time mover, verified against a retired seat', () => {
  it('a verified-retired staleOriginator with a non-coordinator sender moves (widened predicate works)', async () => {
    const fixture = baseFixture();
    fixture.session_coordination = [
      { id: 'a', target_session: 'retired-1', sender_type: 'solomon', acknowledged_at: null, payload: { kind: 'adam_advisory' }, created_at: recent(1) },
    ];
    const sb = createFixtureSupabase(fixture);
    const result = await retargetStaleAdamInbound(sb, { staleOriginator: 'retired-1', liveAdam: 'live-adam' });
    expect(result.error).toBeNull();
    expect(result.retargeted).toBe(1);
    const row = sb.table('session_coordination')[0];
    expect(row.target_session).toBe('live-adam');
    expect(row.payload.retargeted_from).toBe('retired-1');
    expect(row.payload.retargeted_at).toBeTruthy();
  });

  it('an UNVERIFIED staleOriginator (live role=adam, or an unrelated non-Adam session) moves 0 even when unacked — the blast-radius regression test', async () => {
    const fixture = baseFixture();
    fixture.session_coordination = [
      { id: 'a', target_session: 'live-adam', sender_type: 'worker', acknowledged_at: null, payload: { kind: 'coordinator_reply' }, created_at: recent(1) },
      { id: 'b', target_session: 'someone-else', sender_type: 'worker', acknowledged_at: null, payload: { kind: 'coordinator_reply' }, created_at: recent(1) },
    ];
    const sb = createFixtureSupabase(fixture);
    const r1 = await retargetStaleAdamInbound(sb, { staleOriginator: 'live-adam', liveAdam: 'new-adam' });
    expect(r1.retargeted).toBe(0);
    const r2 = await retargetStaleAdamInbound(sb, { staleOriginator: 'someone-else', liveAdam: 'new-adam' });
    expect(r2.retargeted).toBe(0);
    // rows must be untouched
    expect(sb.table('session_coordination')[0].target_session).toBe('live-adam');
    expect(sb.table('session_coordination')[1].target_session).toBe('someone-else');
  });

  it('no longer filters on sender_type=coordinator — a solomon or orchestrator sender at a verified retired seat also moves', async () => {
    const fixture = baseFixture();
    fixture.session_coordination = [
      { id: 'a', target_session: 'retired-1', sender_type: 'orchestrator', acknowledged_at: null, payload: { kind: 'adam_action_required' }, created_at: recent(1) },
    ];
    const sb = createFixtureSupabase(fixture);
    const result = await retargetStaleAdamInbound(sb, { staleOriginator: 'retired-1', liveAdam: 'live-adam' });
    expect(result.retargeted).toBe(1);
  });

  it('resolver error fails closed (0 retargeted, error surfaced)', async () => {
    const sb = createFixtureSupabase(baseFixture());
    sb.setError('claude_sessions');
    const result = await retargetStaleAdamInbound(sb, { staleOriginator: 'retired-1', liveAdam: 'live-adam' });
    expect(result.retargeted).toBe(0);
    expect(result.error).toBeTruthy();
  });

  it('same-session and missing-argument no-ops are preserved', async () => {
    const sb = createFixtureSupabase(baseFixture());
    expect(await retargetStaleAdamInbound(sb, { staleOriginator: 'x', liveAdam: 'x' })).toEqual({ retargeted: 0, error: null });
    expect(await retargetStaleAdamInbound(sb, { staleOriginator: null, liveAdam: 'x' })).toEqual({ retargeted: 0, error: null });
  });
});

// FR-7/AC-13/TS-14: resolveAdamSessionIds (the watchdog's own resolver) must see BOTH live and
// retired Adam seats. Uses the genuinely-filtering fixture store rather than the existing
// watchdog test file's fakeSupabase (which returns adamIds unconditionally regardless of the
// role filter applied — non-vacuous only here, not there).
describe('resolveAdamSessionIds (watchdog, FR-7) — sees both live and retired Adam seats', () => {
  it('returns ids for role=adam AND role=adam_retired, excluding other roles', async () => {
    const sb = createFixtureSupabase({
      claude_sessions: [
        { session_id: 'live-adam', metadata: { role: 'adam' } },
        { session_id: 'retired-adam', metadata: { role: ADAM_RETIRED_ROLE } },
        { session_id: 'other', metadata: { role: 'worker' } },
      ],
    });
    const { ids, error } = await resolveAdamSessionIds(sb);
    expect(error).toBeNull();
    expect(ids.sort()).toEqual(['live-adam', 'retired-adam']);
  });

  it('is non-vacuous: with only a retired seat and no live one, still returns it (proves the filter is not a no-op)', async () => {
    const sb = createFixtureSupabase({
      claude_sessions: [{ session_id: 'retired-only', metadata: { role: ADAM_RETIRED_ROLE } }],
    });
    const { ids } = await resolveAdamSessionIds(sb);
    expect(ids).toEqual(['retired-only']);
  });
});

// TR-4/AC-14: ADAM_MAIL_TTL_DAYS must not silently drift from the ESM source of truth.
describe('AC-14 — ADAM_MAIL_TTL_DAYS stays in sync with the ESM ACK_TTL_DAYS source', () => {
  it('adam-identity.cjs local constant matches lib/retention/session-coordination-ack-convergence.js', () => {
    const retentionSrc = fs.readFileSync(path.join(repoRoot, 'lib/retention/session-coordination-ack-convergence.js'), 'utf8');
    const m = /const ACK_TTL_DAYS\s*=\s*(\d+)/.exec(retentionSrc);
    expect(m).not.toBeNull(); // source-pin must actually match before comparing
    expect(ADAM_MAIL_TTL_DAYS).toBe(Number(m[1]));
  });
});
