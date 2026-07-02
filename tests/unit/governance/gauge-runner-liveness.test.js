/**
 * Unit tests for lib/governance/gauge-runner-liveness.js (invariant #0, who-watches-the-watchmen).
 *
 * SD-LEO-INFRA-INVARIANT-GAUGES-FRAMEWORK-001 FR-4, TS-4.
 *
 * @module tests/unit/governance/gauge-runner-liveness.test.js
 */

import { describe, it, expect } from 'vitest';
import { checkGaugeRunnerLiveness, STALE_HEARTBEAT_THRESHOLD_MS } from '../../../lib/governance/gauge-runner-liveness.js';

const NOW = Date.parse('2026-07-02T12:00:00.000Z');

describe('checkGaugeRunnerLiveness (TS-4)', () => {
  it('alarm:true when no heartbeat has ever been recorded', () => {
    expect(checkGaugeRunnerLiveness(null, NOW)).toEqual({ alarm: true, ageMs: null });
    expect(checkGaugeRunnerLiveness(undefined, NOW)).toEqual({ alarm: true, ageMs: null });
  });

  it('alarm:false for a fresh heartbeat well within the threshold', () => {
    const fresh = new Date(NOW - 5 * 60 * 1000).toISOString(); // 5m ago
    const result = checkGaugeRunnerLiveness(fresh, NOW);
    expect(result.alarm).toBe(false);
    expect(result.ageMs).toBe(5 * 60 * 1000);
  });

  it('alarm:true for a heartbeat older than the threshold', () => {
    const stale = new Date(NOW - (STALE_HEARTBEAT_THRESHOLD_MS + 60 * 1000)).toISOString(); // threshold + 1m
    const result = checkGaugeRunnerLiveness(stale, NOW);
    expect(result.alarm).toBe(true);
  });

  it('boundary: exactly at the threshold does not alarm (strictly greater-than)', () => {
    const exact = new Date(NOW - STALE_HEARTBEAT_THRESHOLD_MS).toISOString();
    const result = checkGaugeRunnerLiveness(exact, NOW);
    expect(result.alarm).toBe(false);
  });

  it('a custom threshold overrides the default', () => {
    const tenMinAgo = new Date(NOW - 10 * 60 * 1000).toISOString();
    expect(checkGaugeRunnerLiveness(tenMinAgo, NOW, 5 * 60 * 1000).alarm).toBe(true);
    expect(checkGaugeRunnerLiveness(tenMinAgo, NOW, 15 * 60 * 1000).alarm).toBe(false);
  });

  it('an unparseable timestamp is treated as alarm:true, not a thrown error', () => {
    expect(() => checkGaugeRunnerLiveness('not-a-date', NOW)).not.toThrow();
    expect(checkGaugeRunnerLiveness('not-a-date', NOW).alarm).toBe(true);
  });
});
