/**
 * Retained-teeth test for the epistemic-tag contract widen.
 * SD-LEO-INFRA-COMPETITIVE-OBSERVED-TAG-MIGRATION-001 (FR-3).
 *
 * The EPISTEMIC_TAGS array is the service-layer source of truth for valid epistemic tags
 * (kept in lockstep with the competitive_baselines_epistemic_tag_check DB constraint).
 * These assertions prove the contract was WIDENED BY EXACTLY ONE value (OBSERVED) and that
 * the teeth are retained — an unknown tag is still not a member.
 */
import { describe, it, expect } from 'vitest';
import { EPISTEMIC_TAGS } from '../../../lib/discovery/competitive-baseline-service.js';

describe('competitive_baselines epistemic-tag contract', () => {
  it('accepts OBSERVED (the newly-added value)', () => {
    expect(EPISTEMIC_TAGS).toContain('OBSERVED');
  });

  it('preserves all pre-existing values', () => {
    for (const tag of ['FACT', 'ASSUMPTION', 'SIMULATION', 'UNKNOWN']) {
      expect(EPISTEMIC_TAGS).toContain(tag);
    }
  });

  it('was widened by EXACTLY one value (5 total, no more)', () => {
    expect(EPISTEMIC_TAGS).toHaveLength(5);
    expect([...EPISTEMIC_TAGS].sort()).toEqual(
      ['ASSUMPTION', 'FACT', 'OBSERVED', 'SIMULATION', 'UNKNOWN'],
    );
  });

  it('retains teeth: an invalid/unknown tag is still NOT a member', () => {
    for (const bogus of ['BOGUS', 'observed', 'GUESS', '', 'FACTUAL']) {
      expect(EPISTEMIC_TAGS.includes(bogus)).toBe(false);
    }
  });
});
