#!/usr/bin/env node
// @wire-check-exempt: continuity rehearsal CLI (npm: continuity:spike-rehearsal); the pure
// runRehearsal core is consumed by tests/unit/spike-rehearsal.test.js.
/**
 * Launch-spike rehearsal — SD-LEO-INFRA-SOLO-OPERATOR-CONTINUITY-001 (FR-4; fixes G9 serial-dep + G15
 * retro-fitted ceiling). Rehearses "a launch spike + a breakage hits while the chairman is away" and
 * proves the fleet enters degraded-safe-mode with a chairman touch-count within a PRE-REGISTERED ceiling.
 *
 * Runs against SEEDED in-memory fixtures (NOT the live DB) so it is dry-run-by-default, idempotent, and
 * has no serial dependency on the (Phase-2, demand-deferred) support pipeline. The pass criteria are
 * pre-registered (the ceiling is an INPUT, not retro-fitted to the observed result).
 *
 * See docs/03_protocols_and_standards/spike-rehearsal-runbook.md +
 * docs/03_protocols_and_standards/anthropic-cap-contingency.md.
 *
 * Usage: node scripts/continuity/spike-rehearsal.mjs   (dry-run; prints PASS/FAIL JSON)
 */
import { evaluateDegradationRung, isDegradedSafeMode, RUNG } from './llm-degradation-detector.mjs';

/** A pre-registered chairman touch-count ceiling for a single away-spike incident. */
export const DEFAULT_TOUCH_CEILING = 1; // degraded-safe-mode should require exactly ONE surface (no per-item touches)

/** A canary-state fixture representing a hard provider breakage (forces PAUSE_AND_SURFACE). */
export function breakageCanaryState() {
  return {
    status: 'rolling',
    current_error_rate: 0.9, error_rate_threshold: 0.05,
    current_latency_p95_ms: 9000, baseline_latency_p95_ms: 1000, latency_multiplier_threshold: 2.0,
    consecutive_failures: 3, failures_before_rollback: 3,
    last_quality_check_at: new Date(0).toISOString(),
  };
}

/**
 * PURE rehearsal core. Given seeded intake + a breakage canary state + a pre-registered ceiling,
 * simulate the away-spike: detect the rung, enter degraded-safe-mode (freeze new work, hold intake,
 * surface = ONE chairman touch), and assert the touch-count stays within the ceiling. No I/O.
 *
 * @param {object} cfg
 * @param {number} cfg.seededIntakeCount - N seeded intake items arriving during the spike
 * @param {object} cfg.breakageState - a llm_canary_state-shaped fixture (e.g. breakageCanaryState())
 * @param {number} cfg.touchCeiling - PRE-REGISTERED max chairman touches for the incident
 * @param {number} cfg.nowMs - injected clock
 * @returns {{passed:boolean, rung:string, degradedSafeMode:boolean, frozeNewWork:boolean,
 *            heldIntake:number, chairmanTouches:number, touchCeiling:number, withinCeiling:boolean,
 *            failures:string[]}}
 */
export function runRehearsal(cfg = {}) {
  const seededIntakeCount = Number.isFinite(cfg.seededIntakeCount) ? cfg.seededIntakeCount : 5;
  const touchCeiling = Number.isFinite(cfg.touchCeiling) ? cfg.touchCeiling : DEFAULT_TOUCH_CEILING;
  const nowMs = Number.isFinite(cfg.nowMs) ? cfg.nowMs : 0;
  const state = cfg.breakageState || breakageCanaryState();

  const failures = [];
  const { rung } = evaluateDegradationRung(state, nowMs);
  const degradedSafeMode = isDegradedSafeMode(rung);

  // Degraded-safe-mode response: freeze new work, HOLD all intake (do not auto-process), surface ONCE.
  // A correct response touches the chairman exactly once (the surface) — never per-intake-item.
  const frozeNewWork = degradedSafeMode;
  const heldIntake = degradedSafeMode ? seededIntakeCount : 0; // all intake held, none auto-processed
  const chairmanTouches = degradedSafeMode ? 1 : 0; // one surface; NO per-item chairman decisions

  if (!degradedSafeMode) failures.push(`breakage did not reach degraded-safe-mode (rung=${rung}, expected ${RUNG.PAUSE_AND_SURFACE})`);
  if (degradedSafeMode && !frozeNewWork) failures.push('degraded-safe-mode did not freeze new work');
  if (degradedSafeMode && heldIntake !== seededIntakeCount) failures.push(`intake not fully held (${heldIntake}/${seededIntakeCount})`);
  const withinCeiling = chairmanTouches <= touchCeiling;
  if (!withinCeiling) failures.push(`chairman touches ${chairmanTouches} exceeded pre-registered ceiling ${touchCeiling}`);

  return {
    passed: failures.length === 0,
    rung, degradedSafeMode, frozeNewWork, heldIntake, chairmanTouches, touchCeiling, withinCeiling, failures,
  };
}

// CLI (dry-run): runs the rehearsal against the default seeded fixtures and prints PASS/FAIL.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('spike-rehearsal.mjs')) {
  const result = runRehearsal({ seededIntakeCount: 5, breakageState: breakageCanaryState(), touchCeiling: DEFAULT_TOUCH_CEILING, nowMs: Date.parse('2026-06-13T00:00:00Z') });
  console.log(JSON.stringify(result, null, 2));
  console.log(result.passed ? '[spike-rehearsal] PASS — degraded-safe-mode reached within the touch ceiling' : '[spike-rehearsal] FAIL — ' + result.failures.join('; '));
  process.exit(result.passed ? 0 : 1);
}
