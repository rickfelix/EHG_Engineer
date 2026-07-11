/**
 * SD-FDBK-ENH-CONFIRMED-LIVE-TODAY-001 — dormancy watchdog emit gate.
 *
 * process_alive_at (the sole liveness input to detectDormantWorkers, see
 * lib/fleet/dormancy-watchdog.cjs) freezes for hours on Windows when the tick
 * daemon (scripts/session-tick.cjs) self-exits on a 0-row steady-state PATCH
 * (QF-20260509-187), producing false-positive fleet_dormancy feedback for live,
 * actively-working sessions (confirmed on session 4af85f4b, 2026-07-04; signal
 * 12ce5796). isDormancyWatchdogEnabled() gates the emit DORMANT BY DEFAULT,
 * mirroring MASKED_STALL_DETECT_ON in scripts/coordinator-capacity-forecast.mjs.
 *
 * These tests exercise ONLY the pure gate predicate — no claude_sessions access,
 * per risk-agent guidance (sub_agent_execution_results 209327fa-92aa-481c-9fa7-9edb655b20dd)
 * to verify gate logic without touching the shared table.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { isDormancyWatchdogEnabled, filterDormantByPidLiveness } = require('../../scripts/stale-session-sweep.cjs');

describe('isDormancyWatchdogEnabled', () => {
  it('defaults to disabled when the env var is unset', () => {
    expect(isDormancyWatchdogEnabled({})).toBe(false);
  });

  it('stays disabled for any value other than the exact string "on"', () => {
    expect(isDormancyWatchdogEnabled({ LEO_DORMANCY_WATCHDOG_ENABLED: 'true' })).toBe(false);
    expect(isDormancyWatchdogEnabled({ LEO_DORMANCY_WATCHDOG_ENABLED: '1' })).toBe(false);
    expect(isDormancyWatchdogEnabled({ LEO_DORMANCY_WATCHDOG_ENABLED: 'ON' })).toBe(false);
    expect(isDormancyWatchdogEnabled({ LEO_DORMANCY_WATCHDOG_ENABLED: '' })).toBe(false);
  });

  it('enables only on the exact string "on"', () => {
    expect(isDormancyWatchdogEnabled({ LEO_DORMANCY_WATCHDOG_ENABLED: 'on' })).toBe(true);
  });

  it('falls back to process.env when no env object is passed', () => {
    const prior = process.env.LEO_DORMANCY_WATCHDOG_ENABLED;
    delete process.env.LEO_DORMANCY_WATCHDOG_ENABLED;
    try {
      expect(isDormancyWatchdogEnabled()).toBe(false);
      process.env.LEO_DORMANCY_WATCHDOG_ENABLED = 'on';
      expect(isDormancyWatchdogEnabled()).toBe(true);
    } finally {
      if (prior === undefined) delete process.env.LEO_DORMANCY_WATCHDOG_ENABLED;
      else process.env.LEO_DORMANCY_WATCHDOG_ENABLED = prior;
    }
  });
});

// SD-LEO-INFRA-FIX-RESIDUAL-PROCESS-001 (FR-2/FR-3, risk-agent evidence
// 4d1be256-dbc4-4e37-a661-72ffb6453bc0): process_alive_at can freeze while a session is
// genuinely live (session-tick.cjs's daemon dies independently of the CC session). The
// AND-gate cross-checks an orthogonal signal (OS-level PID liveness from pid-*.json
// markers) before trusting process_alive_at-derived dormancy alone.
describe('filterDormantByPidLiveness — the FR-2/FR-3 AND-gate', () => {
  it('drops a dormant candidate whose CLAUDE_SESSION_ID matches an ALIVE marker (process_alive_at lied)', () => {
    const candidates = [{ session_id: 'live-session-uuid' }];
    const markers = { 'marker-own-id-1': { claude_session_id: 'live-session-uuid', pid: 4242, alive: true } };
    expect(filterDormantByPidLiveness(candidates, markers)).toEqual([]);
  });

  it('keeps a dormant candidate whose CLAUDE_SESSION_ID matches a DEAD marker (both signals agree: genuinely dormant)', () => {
    const candidates = [{ session_id: 'dead-session-uuid' }];
    const markers = { 'marker-own-id-2': { claude_session_id: 'dead-session-uuid', pid: 9999, alive: false } };
    expect(filterDormantByPidLiveness(candidates, markers)).toEqual(candidates);
  });

  it('keeps a dormant candidate with NO matching marker at all (no PID evidence either way -- process_alive_at stands)', () => {
    const candidates = [{ session_id: 'orphan-session-uuid' }];
    expect(filterDormantByPidLiveness(candidates, {})).toEqual(candidates);
  });

  it('CRITICAL: joins on marker.claude_session_id, never the map key (marker.session_id) -- proves the fix is not silently inert on the keyspace mismatch', () => {
    const candidates = [{ session_id: 'live-session-uuid' }];
    // The map KEY ('live-session-uuid') deliberately does NOT equal the candidate's
    // session_id here in a way that would pass a naive Object.keys()-based join --
    // only the VALUE's claude_session_id field does. If the implementation ever
    // regresses to keying off the map key instead of the value's claude_session_id,
    // this still passes ONLY if the join correctly reads .claude_session_id.
    const markers = { 'totally-different-marker-key': { claude_session_id: 'live-session-uuid', pid: 1, alive: true } };
    expect(filterDormantByPidLiveness(candidates, markers)).toEqual([]);
  });

  it('a marker with alive=false is never treated as live evidence, even if present', () => {
    const candidates = [{ session_id: 's1' }, { session_id: 's2' }];
    const markers = {
      m1: { claude_session_id: 's1', pid: 1, alive: false },
      m2: { claude_session_id: 's2', pid: 2, alive: true },
    };
    expect(filterDormantByPidLiveness(candidates, markers)).toEqual([{ session_id: 's1' }]);
  });

  it('handles null/undefined dormancyMarkers and empty candidates without throwing', () => {
    expect(filterDormantByPidLiveness([], null)).toEqual([]);
    expect(filterDormantByPidLiveness(undefined, undefined)).toEqual([]);
  });
});
