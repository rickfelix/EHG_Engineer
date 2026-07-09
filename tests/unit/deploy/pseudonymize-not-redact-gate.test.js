/**
 * lib/deploy/pseudonymize-not-redact-gate unit tests
 * SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-C
 */

import { describe, it, expect } from 'vitest';
import { verifyPseudonymized } from '../../../lib/deploy/pseudonymize-not-redact-gate.mjs';

describe('TS-6: pseudonymize gate blocks an unpseudonymized snapshot', () => {
  it('returns allowed:false with a specific reason when pseudonymized !== true', () => {
    const result = verifyPseudonymized({ pseudonymized: false });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not been pseudonymized');
  });

  it('returns allowed:false for a null/undefined snapshot', () => {
    expect(verifyPseudonymized(null).allowed).toBe(false);
    expect(verifyPseudonymized(undefined).allowed).toBe(false);
  });

  it('returns allowed:false when pseudonymized is true but the method is unrecognized', () => {
    const result = verifyPseudonymized({ pseudonymized: true, pseudonymization_method: 'ad-hoc-find-replace' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not a recognized method');
  });
});

describe('TS-7: pseudonymize gate permits a properly pseudonymized snapshot', () => {
  it('returns allowed:true for a recognized pseudonymization method', () => {
    const result = verifyPseudonymized({ pseudonymized: true, pseudonymization_method: 'deterministic-substitution' });
    expect(result.allowed).toBe(true);
  });

  it('accepts format-preserving-hash as a recognized method', () => {
    const result = verifyPseudonymized({ pseudonymized: true, pseudonymization_method: 'format-preserving-hash' });
    expect(result.allowed).toBe(true);
  });
});
