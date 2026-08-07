/**
 * SD-LEO-INFRA-SESSION-TICK-DAEMONS-001 FR-4 / TS-7.
 *
 * TS-7 IS THE POINT: a census assertion that has only ever run on a clean host has not been shown
 * to detect anything. It would pass vacuously forever and read exactly like a working alarm. So
 * the control here is a deliberately leaked daemon, and it must make the assertion FAIL.
 *
 * The two-sided half matters just as much: a PARKED /loop worker shares the "stale last_tool_at"
 * side of the signature, and an alarm that fires on parked workers gets muted, which is how you
 * arrive back at days of silent accumulation.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const { leakedDaemonSessions, assertDaemonCensus, STALE_MS } =
  createRequire(import.meta.url)('../../../lib/fleet/daemon-census.cjs');

const NOW = Date.parse('2026-08-04T14:00:00Z');
const agoMin = (m) => new Date(NOW - m * 60_000).toISOString();
const agoH = (h) => new Date(NOW - h * 3_600_000).toISOString();

const row = (session_id, hb, lt) => ({ session_id, heartbeat_at: hb, last_tool_at: lt });

describe('FR-4 census — TS-7 control', () => {
  it('TS-7 FAILS against a deliberately leaked daemon', () => {
    // b22451df as measured live: stamping this second, conversation silent for 51h.
    const r = assertDaemonCensus({ rows: [row('b22451df', agoMin(0), agoH(51))], now: NOW });
    expect(r.ok).toBe(false);
    expect(r.leaked.map((l) => l.session_id)).toEqual(['b22451df']);
    expect(r.detail).toContain('b22451df');
  });

  it('passes on a clean census — and that pass is only meaningful because TS-7 can fail', () => {
    const r = assertDaemonCensus({ rows: [row('live', agoMin(0), agoMin(2))], now: NOW });
    expect(r.ok).toBe(true);
  });
});

describe('FR-4 census — the parked worker must never trip it', () => {
  // ScheduleWakeup clamps to [60,3600]s, so ~1h + one turn is the structural ceiling.
  it.each([5, 20, 30, 60, 90])('parked worker %i minutes between wakeups is NOT leaked', (mins) => {
    const r = assertDaemonCensus({ rows: [row('parked', agoMin(0), agoMin(mins))], now: NOW });
    expect(r.ok).toBe(true);
  });

  it('CONTROL — the same parked worker DOES trip it once past the threshold, so the margin is real', () => {
    const r = assertDaemonCensus({ rows: [row('parked', agoMin(0), agoH(7))], now: NOW });
    expect(r.ok).toBe(false);
  });

  it('leaves a 6x margin over the 1h parked ceiling', () => {
    expect(STALE_MS).toBe(6 * 60 * 60 * 1000);
  });
});

describe('FR-4 census — what is deliberately NOT flagged', () => {
  it('a dead daemon (stale heartbeat) is not a leak — nothing is stamping', () => {
    // This is an ordinary abandoned row, not a daemon burning cycles for a dead conversation.
    const r = assertDaemonCensus({ rows: [row('old', agoH(30), agoH(30))], now: NOW });
    expect(r.ok).toBe(true);
  });

  it('a missing last_tool_at is UNKNOWN, not a leak', () => {
    // Absence is not evidence. Alarming on unknown is how an assertion gets muted.
    expect(assertDaemonCensus({ rows: [row('new', agoMin(0), null)], now: NOW }).ok).toBe(true);
  });

  it('an unparseable timestamp is skipped rather than coerced', () => {
    expect(assertDaemonCensus({ rows: [row('bad', agoMin(0), 'not-a-date')], now: NOW }).ok).toBe(true);
  });

  it('a future heartbeat (clock skew) is not counted as fresh', () => {
    const future = new Date(NOW + 60_000).toISOString();
    expect(assertDaemonCensus({ rows: [row('skew', future, agoH(51))], now: NOW }).ok).toBe(true);
  });
});

describe('FR-4 census — shape', () => {
  it('returns every leaked session, not just the first', () => {
    const rows = [
      row('a', agoMin(0), agoH(51)),
      row('b', agoMin(1), agoH(20)),
      row('ok', agoMin(0), agoMin(3)),
    ];
    expect(leakedDaemonSessions({ rows, now: NOW }).map((l) => l.session_id)).toEqual(['a', 'b']);
  });

  it('is inert on junk input rather than throwing', () => {
    expect(leakedDaemonSessions({ rows: null, now: NOW })).toEqual([]);
    expect(leakedDaemonSessions({ rows: [null, {}], now: NOW })).toEqual([]);
    expect(leakedDaemonSessions({ rows: [], now: NaN })).toEqual([]);
  });
});
