/**
 * SD-LEO-INFRA-CAPACITY-FORECAST-STALLED-BELT-EMPTY-FP-001 (belt-empty guard)
 * SD-LEO-FEAT-COORDINATOR-CAPACITY-FORECAST-001 (TTL realism)
 *
 * The capacity forecast labels an idle worker STALLED only when its loop is alive but NOT claiming
 * DESPITE available work — a stale heartbeat AND a non-empty belt. Two false positives are guarded:
 *   1. an empty belt (nothing to claim) → never STALLED, and
 *   2. a heartbeat younger than a full healthy /loop idle re-poll cycle (600–1200s) → never STALLED,
 *      because a healthy idle worker between ticks simply hasn't reached its next scheduled wake.
 * Only a heartbeat older than DEFAULT_STALL_TTL_S (1800s) — a worker that has demonstrably MISSED a
 * wake → loop dead → needs /loop re-arm — counts as a genuine stall.
 */
import { describe, it, expect } from 'vitest';
import { classifyIdleWorker, DEFAULT_STALL_TTL_S } from '../../scripts/lib/capacity-idle-classifier.mjs';

describe('classifyIdleWorker — belt-depth-gated stall classification', () => {
  it('stale heartbeat + EMPTY belt is NOT stalled (belt-empty false-positive)', () => {
    const r = classifyIdleWorker({ hbAgeS: 2000, beltDepth: 0 });
    expect(r.stalled).toBe(false);
    expect(r.state).toBe('IDLE');
    expect(r.detail).toBe('available');
  });

  it('genuinely-stale heartbeat (> TTL) + NON-EMPTY belt IS stalled (genuine stall preserved)', () => {
    const r = classifyIdleWorker({ hbAgeS: 1900, beltDepth: 2 });
    expect(r.stalled).toBe(true);
    expect(r.state).toBe('IDLE⚠STALLED');
    expect(r.detail).toMatch(/loop re-arm/);
  });

  it('healthy idle worker between ticks (hbAge within idle cadence) + non-empty belt is NOT stalled (the TTL false-positive being fixed)', () => {
    // 900s is past the OLD 180s threshold but within the real 600–1200s /loop idle cadence — this is
    // the exact case that used to be mislabeled "STALLED — needs /loop re-arm".
    for (const hbAgeS of [300, 600, 900, 1200]) {
      expect(classifyIdleWorker({ hbAgeS, beltDepth: 3 }).stalled).toBe(false);
    }
  });

  it('fresh heartbeat + non-empty belt is NOT stalled', () => {
    expect(classifyIdleWorker({ hbAgeS: 60, beltDepth: 5 }).stalled).toBe(false);
  });

  it('boundary: hbAgeS exactly at the default TTL (1800) is NOT stalled (strict greater-than)', () => {
    expect(classifyIdleWorker({ hbAgeS: DEFAULT_STALL_TTL_S, beltDepth: 5 }).stalled).toBe(false);
    expect(classifyIdleWorker({ hbAgeS: DEFAULT_STALL_TTL_S + 1, beltDepth: 5 }).stalled).toBe(true);
  });

  it('default TTL exceeds both the max idle re-poll interval (1200s) and claim_sd liveness (900s)', () => {
    expect(DEFAULT_STALL_TTL_S).toBeGreaterThan(1200);
    expect(DEFAULT_STALL_TTL_S).toBeGreaterThan(900);
  });

  it('custom ttlS is honored', () => {
    expect(classifyIdleWorker({ hbAgeS: 100, beltDepth: 3, ttlS: 90 }).stalled).toBe(true);
    expect(classifyIdleWorker({ hbAgeS: 100, beltDepth: 0, ttlS: 90 }).stalled).toBe(false);
  });

  it('defaults to not-stalled when called with no args', () => {
    expect(classifyIdleWorker().stalled).toBe(false);
  });
});
