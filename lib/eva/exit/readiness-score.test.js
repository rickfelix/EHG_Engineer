/**
 * Unit tests for the EVA exit business-readiness scoring lib
 * (SD-LEO-REFAC-RECONCILE-EVA-EXIT-001, FR-3 / M2).
 *
 * Verifies the extracted logic is a faithful, behavior-preserving port of the original
 * inline implementation that lived in server/routes/eva-exit.js (PATCH /readiness/:ventureId):
 *   - weighted ARR 0.4 / customer 0.3 / growth 0.3
 *   - per-ratio 1.5 cap
 *   - weight renormalization over only the metrics present
 *   - zero-ratio fallback => 0
 *   - overall 100 cap + integer rounding
 *   - the 2-consecutive-period chairman-escalation latch (idempotent)
 */
import { describe, it, expect } from 'vitest';
import {
  computeReadinessScore,
  shouldTriggerChairmanReview,
  DEFAULT_READINESS_THRESHOLD,
} from './readiness-score.js';

describe('computeReadinessScore', () => {
  it('weights ARR(0.4)/customer(0.3)/growth(0.3) when all three are present', () => {
    // ARR 0.8, customer 0.9, growth 0.5 → 0.8*0.4 + 0.9*0.3 + 0.5*0.3 = 0.74 → 74
    const score = computeReadinessScore({
      target_arr: 100, actual_arr: 80,
      target_customer_count: 100, actual_customer_count: 90,
      growth_rate_target: 10, growth_rate_actual: 5,
    });
    expect(score).toBe(74);
  });

  it('caps each ratio at 1.5 (overshoot does not exceed the cap)', () => {
    // ARR-only, actual/target = 10 → capped to 1.5 → renormalized over weight 0.4 → 1.5 → 150 → 100
    const score = computeReadinessScore({ target_arr: 100, actual_arr: 1000 });
    expect(score).toBe(100);
  });

  it('renormalizes weights over only the metrics present (partial metric set)', () => {
    // customer-only 0.5 → renormalized over weight 0.3 → 0.5 → 50
    const score = computeReadinessScore({ target_customer_count: 100, actual_customer_count: 50 });
    expect(score).toBe(50);
  });

  it('returns 0 when no usable ratio exists (empty input)', () => {
    expect(computeReadinessScore({})).toBe(0);
    expect(computeReadinessScore()).toBe(0);
  });

  it('skips a metric whose target is not > 0 (zero/negative target => no ratio)', () => {
    // target_arr 0 disqualifies ARR; nothing else present → 0
    expect(computeReadinessScore({ target_arr: 0, actual_arr: 50 })).toBe(0);
  });

  it('skips a metric whose actual is null/undefined', () => {
    // ARR present but actual null → skipped; customer present → scores on customer only
    const score = computeReadinessScore({
      target_arr: 100, actual_arr: null,
      target_customer_count: 100, actual_customer_count: 80,
    });
    expect(score).toBe(80); // 0.8 renormalized over weight 0.3
  });

  it('caps the overall score at 100 when every ratio hits the 1.5 cap', () => {
    const score = computeReadinessScore({
      target_arr: 1, actual_arr: 100,
      target_customer_count: 1, actual_customer_count: 100,
      growth_rate_target: 1, growth_rate_actual: 100,
    });
    expect(score).toBe(100);
  });

  it('rounds to the nearest integer', () => {
    // ARR-only 0.855 → 85.5 → round → 86
    expect(computeReadinessScore({ target_arr: 1000, actual_arr: 855 })).toBe(86);
  });
});

describe('shouldTriggerChairmanReview', () => {
  it('latches when above threshold for two consecutive periods and not already triggered', () => {
    expect(shouldTriggerChairmanReview({ previousScore: 80, newScore: 85, threshold: 70, alreadyTriggered: false })).toBe(true);
  });

  it('is idempotent: returns false once already triggered', () => {
    expect(shouldTriggerChairmanReview({ previousScore: 80, newScore: 85, threshold: 70, alreadyTriggered: true })).toBe(false);
  });

  it('does not latch when the previous period was below threshold', () => {
    expect(shouldTriggerChairmanReview({ previousScore: 60, newScore: 85, threshold: 70, alreadyTriggered: false })).toBe(false);
  });

  it('does not latch when the current period is below threshold', () => {
    expect(shouldTriggerChairmanReview({ previousScore: 80, newScore: 65, threshold: 70, alreadyTriggered: false })).toBe(false);
  });

  it('does not latch when there is no previous score (undefined compares false)', () => {
    expect(shouldTriggerChairmanReview({ previousScore: undefined, newScore: 85, threshold: 70 })).toBe(false);
  });

  it('uses DEFAULT_READINESS_THRESHOLD (70) when threshold is omitted', () => {
    expect(DEFAULT_READINESS_THRESHOLD).toBe(70);
    // 80 and 90 both > 70 → latch
    expect(shouldTriggerChairmanReview({ previousScore: 80, newScore: 90 })).toBe(true);
    // 65 not > 70 → no latch
    expect(shouldTriggerChairmanReview({ previousScore: 65, newScore: 90 })).toBe(false);
  });
});
