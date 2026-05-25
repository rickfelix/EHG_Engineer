// QF-20260525-885: non-array proven_solutions must not crash the KB.
// calculateSuccessRate / getSolution / recordOccurrence all guarded proven_solutions with
// "!x || .length===0", which a non-array jsonb value (object/string) slips past, throwing
// "<x> is not a function" on .reduce()/.sort()/.find(). Closes feedback 62cfbdd8 (primary).
// The secondary catch-binding at search-prior-issues.js:311 was already fixed by QF-20260525-049.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IssueKnowledgeBase } from '../../../lib/learning/issue-knowledge-base.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../lib/learning/issue-knowledge-base.js');

describe('QF-20260525-885: calculateSuccessRate is non-array safe', () => {
  const kb = new IssueKnowledgeBase();

  it('returns 0 (no throw) when proven_solutions is a non-array object', () => {
    expect(() => kb.calculateSuccessRate({ proven_solutions: {} })).not.toThrow();
    expect(kb.calculateSuccessRate({ proven_solutions: {} })).toBe(0);
  });

  it('returns 0 (no throw) when proven_solutions is a string', () => {
    expect(() => kb.calculateSuccessRate({ proven_solutions: 'oops' })).not.toThrow();
    expect(kb.calculateSuccessRate({ proven_solutions: 'oops' })).toBe(0);
  });

  it('returns 0 when proven_solutions is null/undefined/empty', () => {
    expect(kb.calculateSuccessRate({ proven_solutions: null })).toBe(0);
    expect(kb.calculateSuccessRate({})).toBe(0);
    expect(kb.calculateSuccessRate({ proven_solutions: [] })).toBe(0);
  });

  it('still computes the correct rate for a valid array', () => {
    const pattern = { proven_solutions: [
      { times_applied: 4, times_successful: 3 },
      { times_applied: 6, times_successful: 3 },
    ] };
    // 6 successful / 10 applied = 0.6
    expect(kb.calculateSuccessRate(pattern)).toBeCloseTo(0.6, 5);
  });
});

describe('QF-20260525-885: all three proven_solutions sites use Array.isArray', () => {
  const src = readFileSync(SRC, 'utf8');

  it('getSolution guards .sort() with Array.isArray', () => {
    expect(src).toMatch(/if \(!pattern \|\| !Array\.isArray\(pattern\.proven_solutions\)/);
  });

  it('recordOccurrence coerces non-array proven_solutions to []', () => {
    expect(src).toMatch(/Array\.isArray\(pattern\.proven_solutions\) \? pattern\.proven_solutions : \[\]/);
  });

  it('calculateSuccessRate guards .reduce() with Array.isArray', () => {
    expect(src).toMatch(/if \(!Array\.isArray\(pattern\.proven_solutions\) \|\| pattern\.proven_solutions\.length === 0\)/);
  });

  it('no remaining unguarded "!pattern.proven_solutions ||" length guards that precede array ops', () => {
    // both length-guards now lead with Array.isArray; the bare truthy guard is gone from these sites
    expect(src).not.toMatch(/if \(!pattern\.proven_solutions \|\| pattern\.proven_solutions\.length === 0\) \{\s*\n\s*return 0;/);
  });
});
