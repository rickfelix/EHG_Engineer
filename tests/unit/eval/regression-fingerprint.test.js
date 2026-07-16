import { describe, it, expect } from 'vitest';
import { currentSurface, fingerprintOf } from '../../../scripts/eval/regression-fingerprint.mjs';

describe('TS-6 regression fingerprint', () => {
  it('stable on unchanged surface, changes when the surface changes', () => {
    const s = currentSurface();
    expect(fingerprintOf(s)).toBe(fingerprintOf(currentSurface()));
    expect(fingerprintOf({ ...s, models: [...s.models, 'new-model'] })).not.toBe(fingerprintOf(s));
    expect(fingerprintOf({ ...s, rule: { ...s.rule, MIN_N: 31 } })).not.toBe(fingerprintOf(s));
  });
});
