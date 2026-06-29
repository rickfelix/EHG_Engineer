/**
 * SD-LEO-INFRA-FORECASTER-DISTILL-GATE-AWARENESS-001 (FR-3)
 *
 * When auto-refill is intentionally OFF, a corpus-thin belt-low is the CORRECT state, not a fillable
 * deficit: the forecaster must NOT advise distilling/activating the corpus and must NOT fire a
 * DEFICIT-driven Adam ping. classifyCorpusGatedDeficit encodes that reframe; only a genuine non-corpus
 * shortfall (no unpromoted corpus, or auto-refill ON) stays a real DEFICIT.
 */
import { describe, it, expect } from 'vitest';
import { classifyCorpusGatedDeficit } from '../../../scripts/lib/sourcing-engine-awareness.mjs';

const BASE = 'engine DORMANT with 50 unpromoted roadmap item(s) -> activate / distill';

describe('classifyCorpusGatedDeficit', () => {
  it('TS-1: auto-refill OFF + corpus + DEFICIT => corpus-gated, verdict OK-CORPUS-GATED, reframed (no distill/activate)', () => {
    const r = classifyCorpusGatedDeficit({ verdict: 'DEFICIT', autoRefillOn: false, unpromotedCount: 50, baseRecommendation: BASE });
    expect(r.corpusGated).toBe(true);
    expect(r.verdict).toBe('OK-CORPUS-GATED');
    expect(r.verdict.startsWith('DEFICIT')).toBe(false); // the deficit Adam-ping is gated on this
    expect(r.recommendation).not.toMatch(/distill|activate/i);
    expect(r.recommendation).toMatch(/not a fillable deficit|corpus-thin belt is EXPECTED/i);
  });

  it('TS-1b: also gates DEFICIT-URGENT when auto-refill OFF + corpus', () => {
    const r = classifyCorpusGatedDeficit({ verdict: 'DEFICIT-URGENT', autoRefillOn: false, unpromotedCount: 3, baseRecommendation: BASE });
    expect(r.corpusGated).toBe(true);
    expect(r.verdict).toBe('OK-CORPUS-GATED');
  });

  it('TS-2: auto-refill ON + corpus + DEFICIT => unchanged (prior behavior restored)', () => {
    const r = classifyCorpusGatedDeficit({ verdict: 'DEFICIT', autoRefillOn: true, unpromotedCount: 50, baseRecommendation: BASE });
    expect(r.corpusGated).toBe(false);
    expect(r.verdict).toBe('DEFICIT');
    expect(r.recommendation).toBe(BASE);
  });

  it('TS-3: auto-refill OFF + 0 corpus + DEFICIT => unchanged (genuine non-corpus shortfall stays DEFICIT)', () => {
    const r = classifyCorpusGatedDeficit({ verdict: 'DEFICIT', autoRefillOn: false, unpromotedCount: 0, baseRecommendation: 'genuine shortfall' });
    expect(r.corpusGated).toBe(false);
    expect(r.verdict).toBe('DEFICIT');
    expect(r.recommendation).toBe('genuine shortfall');
  });

  it('TS-4: a non-DEFICIT verdict is unchanged regardless of arm/corpus', () => {
    for (const verdict of ['TIGHT', 'SURPLUS']) {
      const off = classifyCorpusGatedDeficit({ verdict, autoRefillOn: false, unpromotedCount: 99, baseRecommendation: BASE });
      expect(off).toEqual({ corpusGated: false, verdict, recommendation: BASE });
    }
  });

  it('totality: missing/odd inputs never throw and default to not-gated', () => {
    expect(classifyCorpusGatedDeficit()).toEqual({ corpusGated: false, verdict: undefined, recommendation: undefined });
    expect(classifyCorpusGatedDeficit({ verdict: 'DEFICIT', autoRefillOn: false, unpromotedCount: null, baseRecommendation: 'x' }).corpusGated).toBe(false); // unknown corpus count => not gated
  });
});
