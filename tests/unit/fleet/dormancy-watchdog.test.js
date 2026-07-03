/**
 * QF-20260703-076 — dormancy-watchdog.cjs pure detector.
 *
 * Verification cases mirror the RCA's own reachability findings, notably the
 * heartbeat-masking trap: session cb2bfe72 showed a FRESH heartbeat_at while
 * process_alive_at was ~24.8h stale, so the detector must key on process_alive_at
 * and must never be influenced by heartbeat_at (the detector doesn't even accept it).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  detectDormantWorkers,
  isDormant,
  ELAPSED_GRACE_MS,
  PROCESS_ALIVE_STALE_MS,
} = require('../../../lib/fleet/dormancy-watchdog.cjs');

const NOW = Date.parse('2026-07-03T14:00:00Z');

function isoMinutesAgo(mins, from = NOW) {
  return new Date(from - mins * 60 * 1000).toISOString();
}

describe('isDormant', () => {
  it('(a) awaiting_tick with expected_silence_until still in the future — NOT dormant', () => {
    const s = { loop_state: 'awaiting_tick', expected_silence_until: isoMinutesAgo(-5), process_alive_at: null };
    expect(isDormant(s, NOW)).toBe(false);
  });

  it('(b) awaiting_tick, elapsed silence window, stale process_alive_at — DORMANT', () => {
    const s = {
      loop_state: 'awaiting_tick',
      expected_silence_until: isoMinutesAgo(10),
      process_alive_at: isoMinutesAgo(60 * 24), // ~24h stale, matches cb2bfe72 specimen
    };
    expect(isDormant(s, NOW)).toBe(true);
  });

  it('(c) heartbeat-masking trap: a fresh heartbeat_at must not prevent detection — detector ignores heartbeat_at entirely', () => {
    const s = {
      loop_state: 'awaiting_tick',
      expected_silence_until: isoMinutesAgo(10),
      process_alive_at: isoMinutesAgo(60 * 24),
      heartbeat_at: isoMinutesAgo(0.01), // fresh — must have zero effect
    };
    expect(isDormant(s, NOW)).toBe(true);
  });

  it('(d) loop_state=active with a long-elapsed silence window — DORMANT', () => {
    const s = { loop_state: 'active', expected_silence_until: isoMinutesAgo(41 * 60), process_alive_at: null };
    expect(isDormant(s, NOW)).toBe(true);
  });

  it('a recently-ticked worker (process_alive_at fresh) past its silence window is NOT dormant — still working', () => {
    const s = { loop_state: 'awaiting_tick', expected_silence_until: isoMinutesAgo(10), process_alive_at: isoMinutesAgo(1) };
    expect(isDormant(s, NOW)).toBe(false);
  });

  it('elapsed but within the grace margin is NOT yet dormant (avoids a wake-race false positive)', () => {
    const s = { loop_state: 'awaiting_tick', expected_silence_until: isoMinutesAgo(ELAPSED_GRACE_MS / 60000 / 2), process_alive_at: null };
    expect(isDormant(s, NOW)).toBe(false);
  });

  it('process_alive_at exactly at the stale boundary is NOT flagged (boundary is exclusive on the alive side)', () => {
    const s = {
      loop_state: 'awaiting_tick',
      expected_silence_until: isoMinutesAgo(10),
      process_alive_at: isoMinutesAgo(PROCESS_ALIVE_STALE_MS / 60000 - 0.001),
    };
    expect(isDormant(s, NOW)).toBe(false);
  });

  it('loop_state exited or unknown is never flagged, regardless of other fields', () => {
    const base = { expected_silence_until: isoMinutesAgo(60), process_alive_at: isoMinutesAgo(60) };
    expect(isDormant({ ...base, loop_state: 'exited' }, NOW)).toBe(false);
    expect(isDormant({ ...base, loop_state: 'unknown' }, NOW)).toBe(false);
    expect(isDormant({ ...base, loop_state: null }, NOW)).toBe(false);
  });

  it('no expected_silence_until at all (never armed) is not this detector\'s concern', () => {
    const s = { loop_state: 'active', expected_silence_until: null, process_alive_at: isoMinutesAgo(60) };
    expect(isDormant(s, NOW)).toBe(false);
  });

  it('null/undefined session is never flagged', () => {
    expect(isDormant(null, NOW)).toBe(false);
    expect(isDormant(undefined, NOW)).toBe(false);
  });
});

describe('detectDormantWorkers', () => {
  it('returns only the dormant subset with session_id + elapsed_ms', () => {
    const sessions = [
      { session_id: 'alive-1', loop_state: 'awaiting_tick', expected_silence_until: isoMinutesAgo(-5), process_alive_at: null },
      { session_id: 'dormant-1', loop_state: 'awaiting_tick', expected_silence_until: isoMinutesAgo(10), process_alive_at: isoMinutesAgo(60 * 24) },
      { session_id: 'dormant-2', loop_state: 'active', expected_silence_until: isoMinutesAgo(41 * 60), process_alive_at: null },
    ];
    const result = detectDormantWorkers(sessions, NOW);
    expect(result.map((r) => r.session_id).sort()).toEqual(['dormant-1', 'dormant-2']);
    expect(result[0].elapsed_ms).toBeGreaterThan(0);
  });

  it('empty/missing input returns an empty array, never throws', () => {
    expect(detectDormantWorkers([], NOW)).toEqual([]);
    expect(detectDormantWorkers(null, NOW)).toEqual([]);
    expect(detectDormantWorkers(undefined, NOW)).toEqual([]);
  });
});
