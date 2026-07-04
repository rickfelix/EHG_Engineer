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
const { isDormancyWatchdogEnabled } = require('../../scripts/stale-session-sweep.cjs');

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
