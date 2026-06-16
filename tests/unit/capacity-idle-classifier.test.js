/**
 * SD-LEO-INFRA-CAPACITY-FORECAST-STALLED-BELT-EMPTY-FP-001
 * The capacity forecast labels an idle worker STALLED only when its loop is alive but NOT claiming
 * DESPITE available work — a stale heartbeat AND a non-empty belt. An empty belt means there is
 * nothing to claim, so a stale-heartbeat idle worker is correctly idle (not a false-positive STALL).
 */
import { describe, it, expect } from 'vitest';
import { classifyIdleWorker } from '../../scripts/lib/capacity-idle-classifier.mjs';

describe('classifyIdleWorker — belt-depth-gated stall classification', () => {
  it('stale heartbeat + EMPTY belt is NOT stalled (the false-positive being fixed)', () => {
    const r = classifyIdleWorker({ hbAgeS: 300, beltDepth: 0 });
    expect(r.stalled).toBe(false);
    expect(r.state).toBe('IDLE');
    expect(r.detail).toBe('available');
  });

  it('stale heartbeat + NON-EMPTY belt IS stalled (genuine stall preserved)', () => {
    const r = classifyIdleWorker({ hbAgeS: 300, beltDepth: 2 });
    expect(r.stalled).toBe(true);
    expect(r.state).toBe('IDLE⚠STALLED');
    expect(r.detail).toMatch(/loop re-arm/);
  });

  it('fresh heartbeat + non-empty belt is NOT stalled', () => {
    expect(classifyIdleWorker({ hbAgeS: 60, beltDepth: 5 }).stalled).toBe(false);
  });

  it('boundary: hbAgeS exactly at ttlS (180) is NOT stalled (strict greater-than)', () => {
    expect(classifyIdleWorker({ hbAgeS: 180, beltDepth: 5 }).stalled).toBe(false);
    expect(classifyIdleWorker({ hbAgeS: 181, beltDepth: 5 }).stalled).toBe(true);
  });

  it('custom ttlS is honored', () => {
    expect(classifyIdleWorker({ hbAgeS: 100, beltDepth: 3, ttlS: 90 }).stalled).toBe(true);
    expect(classifyIdleWorker({ hbAgeS: 100, beltDepth: 0, ttlS: 90 }).stalled).toBe(false);
  });

  it('defaults to not-stalled when called with no args', () => {
    expect(classifyIdleWorker().stalled).toBe(false);
  });
});
