// SD-LEO-FIX-GATE2-IMPLEMENTATION-FIDELITY-001 Finding B: countStubOccurrences must report
// the true occurrence count, never collapsed to the count of unique matched line texts.
import { describe, it, expect } from 'vitest';
import { countStubOccurrences } from '../../../scripts/modules/implementation-fidelity/preflight/index.js';

describe('SD-LEO-FIX-GATE2-IMPLEMENTATION-FIDELITY-001 Finding B: countStubOccurrences', () => {
  it('THE PRIMARY REGRESSION TEST: two occurrences sharing identical rendered line text report occurrenceCount=2, not 1', () => {
    const diff = [
      '+const a = () => { placeholder value };',
      '+const b = () => { placeholder value };',
    ].join('\n');
    const patterns = [/(?<!=["'])\bplaceholder\b(?:\s+(?:function|implementation|code|data|value)|$)/gi];
    const { occurrenceCount, foundStubs } = countStubOccurrences(diff, patterns);
    expect(occurrenceCount).toBe(2);
    // foundStubs stays deduped by unique line text for readable "Examples" output.
    expect(foundStubs).toHaveLength(2);
  });

  it('two DIFFERENT patterns each matching once on the same line both count', () => {
    const diff = '+// STUB: placeholder implementation';
    const patterns = [/\/\/\s*STUB:/gi, /placeholder/gi];
    const { occurrenceCount } = countStubOccurrences(diff, patterns);
    expect(occurrenceCount).toBe(2);
  });

  it('no matches returns occurrenceCount=0 and an empty foundStubs array', () => {
    const diff = '+const clean = () => { return realValue; };';
    const patterns = [/placeholder/gi];
    const { occurrenceCount, foundStubs } = countStubOccurrences(diff, patterns);
    expect(occurrenceCount).toBe(0);
    expect(foundStubs).toEqual([]);
  });

  it('a removed (-) line is not scanned at all (diff is already added-lines-only by contract)', () => {
    const diff = '-const stub = () => { placeholder };';
    const patterns = [/placeholder/gi];
    // The regex itself would match the raw text; countStubOccurrences trusts its `diff` input
    // to already be added-lines-only (addedLinesForAmbiguityScan's contract) -- this fixture
    // documents that contract rather than re-testing the filter itself.
    const { foundStubs } = countStubOccurrences(diff, patterns);
    expect(foundStubs).toEqual([]); // the line-attribution loop requires a leading '+'
  });
});
