// SD-LEO-INFRA-BIDIRECTIONAL-REVIEW-MININTERVAL-001 — a min-interval FLOOR on the every-N-SD
// coordinator<->Adam review trigger so a heavy build stretch (16+ SDs in ~8h) doesn't re-fire the
// review repeatedly and dilute it into ritual. The work gate still GATES eligibility; the floor
// SUPPRESSES a re-fire until the interval elapses, WITHOUT resetting the counter (signal preserved).
import { describe, it, expect } from 'vitest';
import { reviewSuppressedByMinInterval } from '../../scripts/coordinator-self-review.mjs';

const HOUR = 3600 * 1000;
const NOW = 1_000_000_000_000;

describe('reviewSuppressedByMinInterval (FR-1)', () => {
  it('SUPPRESSES when a prior review fired more recently than the floor', () => {
    expect(reviewSuppressedByMinInterval({ lastReviewAt: NOW - 1 * HOUR, now: NOW, minIntervalMs: 6 * HOUR })).toBe(true);
  });

  it('ALLOWS once the floor has elapsed (signal preserved — fires with the accumulated delta)', () => {
    expect(reviewSuppressedByMinInterval({ lastReviewAt: NOW - 7 * HOUR, now: NOW, minIntervalMs: 6 * HOUR })).toBe(false);
  });

  it('ALLOWS exactly at the floor boundary (>= interval is no longer suppressed)', () => {
    expect(reviewSuppressedByMinInterval({ lastReviewAt: NOW - 6 * HOUR, now: NOW, minIntervalMs: 6 * HOUR })).toBe(false);
  });

  it('never suppresses the FIRST review (no prior lastReviewAt)', () => {
    expect(reviewSuppressedByMinInterval({ lastReviewAt: undefined, now: NOW, minIntervalMs: 6 * HOUR })).toBe(false);
    expect(reviewSuppressedByMinInterval({ lastReviewAt: null, now: NOW, minIntervalMs: 6 * HOUR })).toBe(false);
    expect(reviewSuppressedByMinInterval({ lastReviewAt: NaN, now: NOW, minIntervalMs: 6 * HOUR })).toBe(false);
  });

  it('floor disabled (minIntervalMs <= 0) never suppresses', () => {
    expect(reviewSuppressedByMinInterval({ lastReviewAt: NOW - 1 * HOUR, now: NOW, minIntervalMs: 0 })).toBe(false);
    expect(reviewSuppressedByMinInterval({ lastReviewAt: NOW - 1 * HOUR, now: NOW, minIntervalMs: -5 })).toBe(false);
  });

  it('null-safe with no args', () => {
    expect(reviewSuppressedByMinInterval()).toBe(false);
  });
});
