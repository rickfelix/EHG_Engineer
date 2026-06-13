/**
 * SD-LEO-INFRA-SOLO-OPERATOR-CONTINUITY-001 (FR-4/FR-5) — launch-spike rehearsal core.
 * Pins: a breakage reaches degraded-safe-mode (freeze/hold/surface) within the PRE-REGISTERED
 * touch ceiling; a too-low ceiling FAILS; a non-breakage does not enter safe-mode.
 */
import { describe, it, expect } from 'vitest';
import { runRehearsal, breakageCanaryState, DEFAULT_TOUCH_CEILING } from '../../scripts/continuity/spike-rehearsal.mjs';

describe('runRehearsal — away-spike degraded-safe-mode', () => {
  it('PASSES: breakage → degraded-safe-mode, freezes work, holds all intake, ONE chairman touch ≤ ceiling', () => {
    const r = runRehearsal({ seededIntakeCount: 5, breakageState: breakageCanaryState(), touchCeiling: DEFAULT_TOUCH_CEILING, nowMs: 0 });
    expect(r.passed).toBe(true);
    expect(r.degradedSafeMode).toBe(true);
    expect(r.frozeNewWork).toBe(true);
    expect(r.heldIntake).toBe(5);            // all intake held, none auto-processed
    expect(r.chairmanTouches).toBe(1);        // one surface, no per-item decisions
    expect(r.withinCeiling).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it('FAILS when the pre-registered ceiling is 0 (touch exceeds ceiling) — ceiling is an INPUT, not retro-fit', () => {
    const r = runRehearsal({ seededIntakeCount: 5, touchCeiling: 0, nowMs: 0 });
    expect(r.passed).toBe(false);
    expect(r.withinCeiling).toBe(false);
    expect(r.failures.join(' ')).toMatch(/ceiling/);
  });

  it('does NOT enter safe-mode (or hold intake) when the canary is healthy', () => {
    const healthy = { status: 'rolling', current_error_rate: 0.01, error_rate_threshold: 0.05, current_latency_p95_ms: 1000, baseline_latency_p95_ms: 1000, latency_multiplier_threshold: 2.0, consecutive_failures: 0, failures_before_rollback: 3, last_quality_check_at: new Date().toISOString() };
    const r = runRehearsal({ seededIntakeCount: 5, breakageState: healthy, touchCeiling: 1, nowMs: Date.parse('2026-06-13T00:01:00Z') });
    expect(r.degradedSafeMode).toBe(false);
    expect(r.heldIntake).toBe(0);
    expect(r.chairmanTouches).toBe(0);
    // passed=false here because the rehearsal expects a breakage to reach safe-mode; healthy input is a mis-seeded run
    expect(r.failures.join(' ')).toMatch(/degraded-safe-mode/);
  });

  it('the chairman touch-count does NOT scale with intake volume (the G15/G9 guarantee)', () => {
    const small = runRehearsal({ seededIntakeCount: 1, touchCeiling: 1, nowMs: 0 });
    const large = runRehearsal({ seededIntakeCount: 500, touchCeiling: 1, nowMs: 0 });
    expect(small.chairmanTouches).toBe(large.chairmanTouches); // 1 regardless of spike size
    expect(large.passed).toBe(true);
  });
});
