/**
 * Unit pins for the PURE intended-hold vs genuine-stall classifier.
 * SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-B (Child B / FR-2).
 */
import { describe, it, expect } from 'vitest';
import { classifyStaleness, isGenuineStall, DEFAULT_STALE_TICKS } from '../../../lib/adam/stall-detector.js';

describe('classifyStaleness', () => {
  it('is fresh below the stale-ticks threshold, regardless of in-flight flag', () => {
    expect(classifyStaleness({ ticksSinceMovement: DEFAULT_STALE_TICKS - 1, inFlightNextStep: false })).toBe('fresh');
    expect(classifyStaleness({ ticksSinceMovement: 0, inFlightNextStep: true })).toBe('fresh');
  });

  it('TS-2: N stale ticks + no in-flight next-step -> genuine stall', () => {
    expect(classifyStaleness({ ticksSinceMovement: DEFAULT_STALE_TICKS, inFlightNextStep: false })).toBe('genuine_stall');
  });

  it('TS-3: N stale ticks + a known in-flight next-step -> intended hold, NOT a stall', () => {
    expect(classifyStaleness({ ticksSinceMovement: DEFAULT_STALE_TICKS, inFlightNextStep: true })).toBe('intended_hold');
  });

  it('respects a custom staleTicks threshold', () => {
    expect(classifyStaleness({ ticksSinceMovement: 3, inFlightNextStep: false }, { staleTicks: 3 })).toBe('genuine_stall');
    expect(classifyStaleness({ ticksSinceMovement: 2, inFlightNextStep: false }, { staleTicks: 3 })).toBe('fresh');
  });

  it('handles missing/undefined fields without throwing', () => {
    expect(classifyStaleness({})).toBe('fresh');
    expect(classifyStaleness(undefined)).toBe('fresh');
  });
});

describe('isGenuineStall', () => {
  it('is true only for the genuine_stall classification', () => {
    expect(isGenuineStall({ ticksSinceMovement: DEFAULT_STALE_TICKS, inFlightNextStep: false })).toBe(true);
    expect(isGenuineStall({ ticksSinceMovement: DEFAULT_STALE_TICKS, inFlightNextStep: true })).toBe(false);
    expect(isGenuineStall({ ticksSinceMovement: 0 })).toBe(false);
  });
});
