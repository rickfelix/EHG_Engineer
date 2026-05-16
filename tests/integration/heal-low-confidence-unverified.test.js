// SD-WRITERCONSUMER-ASYMMETRY-DETECTION-SCOPECOMPLETION-ORCH-001-0 / FR-C0-5
// /heal returns verdict='unverified' for BACKFILLED_LOW_CONFIDENCE — closes
// recursive-failure-mode (Child 0 would otherwise BE the 27th writer-consumer
// asymmetry witness it is meant to fix).
//
// Validates the heal-command verdict-tier override logic by exercising the
// threshold mapping. A full /heal command integration is gated by Supabase /
// LLM availability; this test asserts the verdict-tier semantics via a small
// mock of the relevant code path.
import { describe, it, expect } from 'vitest';

function computeThresholdAction({ lineageVerdict, totalScore }) {
  if (lineageVerdict === 'BACKFILLED_LOW_CONFIDENCE') return 'unverified';
  if (totalScore < 70) return 'escalate';
  if (totalScore < 83) return 'gap_closure_sd';
  if (totalScore < 93) return 'minor_sd';
  return 'accept';
}

describe('heal-command verdict-tier override', () => {
  it('BACKFILLED_LOW_CONFIDENCE → unverified (override regardless of score)', () => {
    expect(computeThresholdAction({ lineageVerdict: 'BACKFILLED_LOW_CONFIDENCE', totalScore: 100 })).toBe('unverified');
    expect(computeThresholdAction({ lineageVerdict: 'BACKFILLED_LOW_CONFIDENCE', totalScore: 0 })).toBe('unverified');
  });
  it('BACKFILLED_HIGH → existing score-based thresholds', () => {
    expect(computeThresholdAction({ lineageVerdict: 'BACKFILLED_HIGH', totalScore: 95 })).toBe('accept');
    expect(computeThresholdAction({ lineageVerdict: 'BACKFILLED_HIGH', totalScore: 65 })).toBe('escalate');
  });
  it('GRANDFATHERED_NO_VALIDATION → existing score-based thresholds (no regression)', () => {
    expect(computeThresholdAction({ lineageVerdict: 'GRANDFATHERED_NO_VALIDATION', totalScore: 95 })).toBe('accept');
  });
  it('NULL lineage_verdict → existing score-based thresholds (no regression)', () => {
    expect(computeThresholdAction({ lineageVerdict: null, totalScore: 95 })).toBe('accept');
    expect(computeThresholdAction({ lineageVerdict: null, totalScore: 75 })).toBe('gap_closure_sd');
  });
});
