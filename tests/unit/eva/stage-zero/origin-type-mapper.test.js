/**
 * SD-FDBK-FIX-ISFIXTUREVENTURE-FALSE-POSITIVES-001 (FR-4/FR-5).
 */
import { describe, it, expect } from 'vitest';
import { toVentureOriginType } from '../../../../lib/eva/stage-zero/origin-type-mapper.js';

describe('toVentureOriginType', () => {
  it('maps nursery_reeval to discovery', () => {
    expect(toVentureOriginType('nursery_reeval')).toBe('discovery');
  });

  it('passes every other currently-valid venture_origin_type enum member through unchanged', () => {
    const validValues = ['manual', 'competitor_clone', 'blueprint', 'competitor_teardown', 'discovery', 'seeded_from_venture'];
    for (const v of validValues) {
      expect(toVentureOriginType(v)).toBe(v);
    }
  });

  it('passes through undefined/null unchanged (never fabricates a value)', () => {
    expect(toVentureOriginType(undefined)).toBeUndefined();
    expect(toVentureOriginType(null)).toBeNull();
  });
});
