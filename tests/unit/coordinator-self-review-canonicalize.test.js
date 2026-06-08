// SD-LEO-INFRA-ARM-CANONICALIZE-WORK-001 — the self-review cron is canonical + the stuck-counter guard.
import { describe, it, expect } from 'vitest';
import { STANDARD_LOOPS } from '../../scripts/coordinator-startup-check.mjs';
import { computeReviewHealth } from '../../lib/fleet/review-health.mjs';

describe('coordinator self-review is in the canonical standard cron set', () => {
  it('STANDARD_LOOPS includes the self-review loop (count grows as other loops are added)', () => {
    // The set also carries flag-review (SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001); assert presence,
    // not an exact count, so this test does not regress when peers add canonical loops.
    expect(STANDARD_LOOPS.some((l) => l.key === 'self-review')).toBe(true);
    expect(STANDARD_LOOPS.length).toBeGreaterThanOrEqual(7);
  });

  it('includes the work-triggered self-review loop with the correct command', () => {
    const sr = STANDARD_LOOPS.find((l) => l.key === 'self-review');
    expect(sr).toBeTruthy();
    expect(sr.script).toBe('coordinator-self-review.mjs');
    expect(sr.prompt).toBe('node scripts/coordinator-self-review.mjs');
    expect(sr.cron).toBe('*/5 * * * *'); // cheap poller cadence
  });

  it('keeps the prior six loops intact (no regression)', () => {
    for (const key of ['sweep', 'dashboard', 'identity', 'inbox', 'audit', 'email']) {
      expect(STANDARD_LOOPS.find((l) => l.key === key)).toBeTruthy();
    }
  });
});

describe('computeReviewHealth — stuck-counter guard', () => {
  it('uninitialized state (no .coord-review-last.json) is NOT stuck', () => {
    const r = computeReviewHealth({ completedCount: 2990, lastReviewCount: null, threshold: 8 });
    expect(r.stuck).toBe(false);
    expect(r.line).toMatch(/uninitialized/i);
  });

  it('delta below threshold is NOT stuck', () => {
    const r = computeReviewHealth({ completedCount: 2950, lastReviewCount: 2945, threshold: 8 }); // delta 5
    expect(r.delta).toBe(5);
    expect(r.stuck).toBe(false);
  });

  it('a single pending window (delta in [threshold, 2*threshold)) is NOT stuck', () => {
    const r = computeReviewHealth({ completedCount: 2957, lastReviewCount: 2945, threshold: 8 }); // delta 12
    expect(r.dueWindows).toBe(1);
    expect(r.stuck).toBe(false);
  });

  it('delta >= 2*threshold is STUCK (the live dormancy: 2990 vs 2945, threshold 8 -> delta 45)', () => {
    const r = computeReviewHealth({ completedCount: 2990, lastReviewCount: 2945, threshold: 8 });
    expect(r.delta).toBe(45);
    expect(r.dueWindows).toBe(5);
    expect(r.stuck).toBe(true);
    expect(r.line).toMatch(/STUCK/);
    expect(r.line).toMatch(/coordinator:self-review|arm/i);
  });

  it('defaults threshold to 8 and clamps a negative delta to 0', () => {
    const r = computeReviewHealth({ completedCount: 100, lastReviewCount: 120 });
    expect(r.delta).toBe(0);
    expect(r.stuck).toBe(false);
  });
});
