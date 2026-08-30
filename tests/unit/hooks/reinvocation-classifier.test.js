// QF-20260830-275 — pure classifier: is a repeat's gap since its prior occurrence explained by
// the harness re-invoking a seat sooner than the ScheduleWakeup delay it armed (re-invocation-
// caused), or is it a genuine same-invocation repeat that must still accumulate toward the
// hard-block (countable)?

import { describe, it, expect } from 'vitest';
import { classifyGap, MIN_CROSS_TURN_GAP_MS } from '../../../lib/hooks/reinvocation-classifier.cjs';

describe('classifyGap', () => {
  it('classifies a gap shorter than the armed delay (but past the same-turn floor) as reinvocation_caused', () => {
    // Charlie shape: armed 300s, re-invoked ~90s later.
    expect(classifyGap({ gapMs: 90_000, armedDelaySeconds: 300 })).toBe('reinvocation_caused');
  });

  it('still counts a fast same-turn repeat even with an arm on record (genuine retry loop, never exempted)', () => {
    expect(classifyGap({ gapMs: 2_000, armedDelaySeconds: 300 })).toBe('countable');
    expect(classifyGap({ gapMs: MIN_CROSS_TURN_GAP_MS - 1, armedDelaySeconds: 60 })).toBe('countable');
  });

  it('counts a gap that respected or exceeded the armed delay (a legitimately spaced-out repeat)', () => {
    expect(classifyGap({ gapMs: 300_000, armedDelaySeconds: 300 })).toBe('countable');
    expect(classifyGap({ gapMs: 400_000, armedDelaySeconds: 300 })).toBe('countable');
  });

  it('fails closed (countable) when there is no arm on record or the shape is invalid', () => {
    expect(classifyGap({ gapMs: 90_000, armedDelaySeconds: undefined })).toBe('countable');
    expect(classifyGap({ gapMs: 90_000, armedDelaySeconds: 0 })).toBe('countable');
    expect(classifyGap({ gapMs: 90_000, armedDelaySeconds: -5 })).toBe('countable');
    expect(classifyGap({ gapMs: NaN, armedDelaySeconds: 300 })).toBe('countable');
    expect(classifyGap({ gapMs: -1, armedDelaySeconds: 300 })).toBe('countable');
  });
});
