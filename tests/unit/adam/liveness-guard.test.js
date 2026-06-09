/**
 * SD-LEO-INFRA-ADAM-OPPORTUNITY-SCAN-001 — liveness guard (pure, DB-free).
 */
import { describe, it, expect } from 'vitest';
import {
  crossVentureAdvisoryAllowed,
  applyLivenessGuard,
  MIN_LIVE_VENTURES_FOR_CROSS_VENTURE,
} from '../../../lib/adam/liveness-guard.js';

describe('crossVentureAdvisoryAllowed (K=3)', () => {
  it('suppresses below K and allows at/above K', () => {
    expect(MIN_LIVE_VENTURES_FOR_CROSS_VENTURE).toBe(3);
    expect(crossVentureAdvisoryAllowed(2).allowed).toBe(false);
    expect(crossVentureAdvisoryAllowed(3).allowed).toBe(true);
    expect(crossVentureAdvisoryAllowed(undefined).allowed).toBe(false);
  });
});

describe('applyLivenessGuard', () => {
  const classA = { dedup_key: 'a', cross_venture: false };
  const classB = { dedup_key: 'b', cross_venture: true };

  it('drops class-B (cross-venture) candidates when the corpus is thin', () => {
    const { kept, dropped } = applyLivenessGuard([classA, classB], 2);
    expect(kept).toEqual([classA]);
    expect(dropped).toEqual([classB]);
  });

  it('keeps class-B candidates once the corpus reaches K', () => {
    const { kept, dropped } = applyLivenessGuard([classA, classB], 3);
    expect(kept).toContain(classB);
    expect(dropped).toEqual([]);
  });

  it('always keeps class-A (single-scope) candidates', () => {
    const { kept } = applyLivenessGuard([classA], 0);
    expect(kept).toEqual([classA]);
  });
});
