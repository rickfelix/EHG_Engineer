// SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-D / FR-1 tests. seatIdleVerdict is the shared, named-axis, pure
// idle predicate replacing four independently-written bodies. These tests pin the no-op-default
// contract (FR-1 AC#2), the TS-2 stale-coordinator regression guard, and the live divergence shapes
// measured across the four existing consumers (session-predicates.mjs and live-countable-worker.mjs
// carry standing comments warning that a well-meaning "unification" can reintroduce a false negative —
// these tests are the falsifiable version of that warning).
import { describe, it, expect } from 'vitest';
import { seatIdleVerdict, isSeatIdle, IDLE_AXIS_NAMES } from '../../lib/fleet/seat-idle-predicate.mjs';

const session = (over = {}) => ({ session_id: 's1', status: 'active', metadata: {}, ...over });

describe('no-op default contract (FR-1 AC#2)', () => {
  it('a plain worker with no ctx is idle', () => {
    expect(isSeatIdle(session())).toBe(true);
  });

  it('an absent coordinatorId in ctx is a no-op -- no session is excluded by id', () => {
    expect(isSeatIdle(session({ session_id: 'anything' }), {})).toBe(true);
  });

  it('an empty statusExcludeSet is a no-op -- matches fleet-dashboard, which applies no status guard today', () => {
    expect(isSeatIdle(session({ status: 'completed' }), { statusExcludeSet: new Set() })).toBe(true);
    expect(isSeatIdle(session({ status: 'completed' }))).toBe(true);
  });

  it('an empty qfHolderSessionIds is a no-op -- matches adam-quiet-tick and capacity-inputs, which check no QF axis today', () => {
    expect(isSeatIdle(session(), { qfHolderSessionIds: new Set() })).toBe(true);
  });

  it('an empty seatBusySessionIds is a no-op -- matches the three narrower consumers, all directed-work blind today', () => {
    expect(isSeatIdle(session(), { seatBusySessionIds: new Set() })).toBe(true);
  });

  it('omitting freshnessField/freshnessWindowMs is a no-op -- freshness is not re-checked here', () => {
    expect(isSeatIdle(session({ heartbeat_at: '2000-01-01T00:00:00Z' }))).toBe(true);
  });

  it('omitting spinUpGraceMs is a no-op -- a session created this instant is still idle', () => {
    expect(isSeatIdle(session({ created_at: new Date().toISOString() }))).toBe(true);
  });
});

describe('base identity exclusions (always applied, no ctx needed)', () => {
  it('excludes by coordinator id when supplied', () => {
    const r = seatIdleVerdict(session({ session_id: 'coord-1' }), { coordinatorId: 'coord-1' });
    expect(r).toEqual({ idle: false, reason: 'coordinator-by-id' });
  });
  it('excludes role=adam', () => {
    expect(seatIdleVerdict(session({ metadata: { role: 'adam' } })).reason).toBe('role-adam');
  });
  it('excludes non_fleet', () => {
    expect(seatIdleVerdict(session({ metadata: { non_fleet: true } })).reason).toBe('non-fleet');
  });
  it('excludes a quarantined session', () => {
    expect(seatIdleVerdict(session({ metadata: { quarantined_at: new Date().toISOString() } })).reason).toBe('quarantined');
  });
  it('excludes a session parked into the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(seatIdleVerdict(session({ metadata: { parked_until: future } })).reason).toBe('parked');
  });
  it('does NOT exclude a session whose park window already expired', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isSeatIdle(session({ metadata: { parked_until: past } }))).toBe(true);
  });
});

describe('C2 fix: fixture-session exclusion, always applied (the gap adam-quiet-tick had)', () => {
  it('excludes the exact specimen from tests/database/seat-busy-fence.test.js', () => {
    const r = seatIdleVerdict(session({ session_id: 'test-session-nswcf-fenced' }));
    expect(r).toEqual({ idle: false, reason: 'fixture-session' });
  });
  it('excludes every fixture family observed in production residue (11 distinct name shapes)', () => {
    const ids = ['test-1c1a9207-1', 'test-telemetry-b5a43e79', 'drain_test_x', 'qf-test-1', 'x-probe-y', 'a-fixture-b'];
    for (const id of ids) expect(isSeatIdle(session({ session_id: id }))).toBe(false);
  });
  it('does NOT exclude a real id merely containing "test" mid-word', () => {
    expect(isSeatIdle(session({ session_id: 'latest-session-42' }))).toBe(true);
  });
});

describe('TS-2 regression guard: stale is_coordinator is excluded, parameterised over both observed shapes', () => {
  it.each([
    ['boolean true', true],
    ["JSON string 'true' (documented in genuine-worker.mjs as an actually-occurring shape)", 'true'],
  ])('excludes a stale, non-active-coordinator session with is_coordinator=%s', (_label, flagValue) => {
    const r = seatIdleVerdict(session({ session_id: 'stale-coord-99', metadata: { is_coordinator: flagValue } }), { coordinatorId: 'the-real-coordinator' });
    expect(r).toEqual({ idle: false, reason: 'coordinator-flag' });
  });

  it('negative control: the ACTUAL active coordinator is excluded via coordinatorId regardless of the flag shape', () => {
    const r = seatIdleVerdict(session({ session_id: 'the-real-coordinator', metadata: {} }), { coordinatorId: 'the-real-coordinator' });
    expect(r.idle).toBe(false); // excluded by coordinator-by-id before the flag axis is even reached
    expect(r.reason).toBe('coordinator-by-id');
  });

  it('THE REGRESSION THIS GUARDS AGAINST: consolidating onto a predicate with no is_coordinator branch would have let this session read idle -- verified it does not here', () => {
    // Mirrors the measured asymmetry: isDispatchableFleetMember alone has no is_coordinator branch.
    // seatIdleVerdict must not reproduce that gap.
    const staleCoordSession = session({ session_id: 'stale-coord-99', metadata: { is_coordinator: true } });
    expect(isSeatIdle(staleCoordSession)).toBe(false);
  });
});

describe('opt-in axes: QF holder, SD holder, directed work, recently-released, spin-up grace', () => {
  it('excludes a QF holder when the axis is supplied', () => {
    const r = seatIdleVerdict(session(), { qfHolderSessionIds: new Set(['s1']) });
    expect(r).toEqual({ idle: false, reason: 'qf-holder-authoritative' });
  });
  it('excludes an authoritative SD holder when the axis is supplied', () => {
    expect(seatIdleVerdict(session(), { sdHolderSessionIds: new Set(['s1']) }).reason).toBe('sd-holder-authoritative');
  });
  it('excludes a seat with a live directed-work reservation when the axis is supplied', () => {
    expect(seatIdleVerdict(session(), { seatBusySessionIds: new Set(['s1']) }).reason).toBe('directed-work');
  });
  it('excludes a recently-released seat when the axis is supplied', () => {
    expect(seatIdleVerdict(session(), { recentlyReleasedSessionIds: new Set(['s1']) }).reason).toBe('recently-released');
  });
  it('excludes a seat inside its spin-up grace window', () => {
    const r = seatIdleVerdict(session({ created_at: new Date().toISOString() }), { spinUpGraceMs: 180_000 });
    expect(r.reason).toBe('spin-up-grace');
  });
  it('does not exclude a seat past its spin-up grace window', () => {
    const old = new Date(Date.now() - 300_000).toISOString();
    expect(isSeatIdle(session({ created_at: old }), { spinUpGraceMs: 180_000 })).toBe(true);
  });
});

describe('freshness axis, opt-in, three column shapes', () => {
  it('excludes a stale heartbeat_at reading beyond the window', () => {
    const stale = new Date(Date.now() - 600_000).toISOString();
    const r = seatIdleVerdict(session({ heartbeat_at: stale }), { freshnessField: 'heartbeat_at', freshnessWindowMs: 300_000 });
    expect(r.reason).toBe('not-fresh');
  });
  it('does not exclude a fresh heartbeat_at reading', () => {
    const fresh = new Date(Date.now() - 60_000).toISOString();
    expect(isSeatIdle(session({ heartbeat_at: fresh }), { freshnessField: 'heartbeat_at', freshnessWindowMs: 300_000 })).toBe(true);
  });
  it('reads last_tool_at when that is the selected field, distinctly from heartbeat_at', () => {
    const staleTool = new Date(Date.now() - 20 * 60_000).toISOString();
    const r = seatIdleVerdict(session({ last_tool_at: staleTool, heartbeat_at: new Date().toISOString() }),
      { freshnessField: 'last_tool_at', freshnessWindowMs: 15 * 60_000 });
    expect(r.reason).toBe('not-fresh');
  });
  it('reads a pre-derived heartbeat_age_seconds field directly, matching the dashboard shape', () => {
    const r = seatIdleVerdict(session({ heartbeat_age_seconds: 1000 }), { freshnessField: 'heartbeat_age_seconds', freshnessWindowMs: 900_000 });
    expect(r.reason).toBe('not-fresh');
  });
  it('a missing freshness field fails toward FRESH, never hiding a worker over a null column', () => {
    expect(isSeatIdle(session({ heartbeat_at: null }), { freshnessField: 'heartbeat_at', freshnessWindowMs: 300_000 })).toBe(true);
  });
});

describe('divergence shapes measured across the four consumers (FR-3 candidates)', () => {
  it('S2: QF holder with null sd_key mirror -- excluded only when the QF axis is supplied', () => {
    const s = session({ session_id: 'qf-holder-1', sd_key: null });
    expect(isSeatIdle(s)).toBe(true); // matches today's adam-quiet-tick / capacity-inputs (QF-blind)
    expect(isSeatIdle(s, { qfHolderSessionIds: new Set(['qf-holder-1']) })).toBe(false); // matches dashboard / eligibleIdleWorkers
  });

  it('S7: just-released, status still active -- excluded only when statusExcludeSet or recentlyReleasedSessionIds is supplied', () => {
    const s = session({ session_id: 'released-shell-1', status: 'active' });
    expect(isSeatIdle(s)).toBe(true);
    expect(isSeatIdle(s, { recentlyReleasedSessionIds: new Set(['released-shell-1']) })).toBe(false);
  });

  it('S6: status=completed with a fresh heartbeat -- excluded only when statusExcludeSet is supplied', () => {
    const s = session({ session_id: 's6', status: 'completed' });
    expect(isSeatIdle(s)).toBe(true); // matches fleet-dashboard, which applies no status guard
    expect(isSeatIdle(s, { statusExcludeSet: new Set(['completed', 'released', 'terminated', 'inactive']) })).toBe(false); // matches capacity-inputs
  });
});

describe('fail-closed on malformed input', () => {
  it('null session is not idle, not a throw', () => {
    expect(seatIdleVerdict(null)).toEqual({ idle: false, reason: 'invalid-session' });
  });
  it('a session that throws mid-check (getter trap) fails toward not-idle', () => {
    const trap = { get session_id() { throw new Error('boom'); }, metadata: {} };
    expect(seatIdleVerdict(trap).idle).toBe(false);
  });
});

it('IDLE_AXIS_NAMES exposes every axis in evaluation order, for the FR-3 differential harness to cite', () => {
  expect(IDLE_AXIS_NAMES).toContain('fixture-session');
  expect(IDLE_AXIS_NAMES).toContain('coordinator-flag');
  expect(IDLE_AXIS_NAMES.indexOf('coordinator-by-id')).toBeLessThan(IDLE_AXIS_NAMES.indexOf('fixture-session'));
});
