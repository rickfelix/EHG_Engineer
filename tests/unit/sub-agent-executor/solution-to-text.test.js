// QF-20260805-671 — a crash wearing a rejection's clothes.
//
// instruction-loader.js called `.substring()` on `proven_solutions[0].solution`, which is an OBJECT
// in 11 of 207 usable issue_patterns rows (measured by paginated walk; the DB exact count 1691
// matched the walk, so it is not a truncated sample). The TypeError killed the ENTIRE sub-agent run,
// which then wrote verdict=ERROR/confidence=0 — and add-prd-to-database.js renders that as
// "BLOCKED, N CRITICAL sub-agent(s) failed". That is strictly worse than the crash: two SDs shipped
// through it believing a reviewer had rejected them, when nothing had judged anything.
//
// Every case below is a way the fix could pass while still being wrong.
import { describe, it, expect } from 'vitest';
import { solutionToText } from '../../../lib/sub-agent-executor/instruction-loader.js';

describe('solutionToText — the object-solution crash (QF-20260805-671)', () => {
  it('[DECIDING] an OBJECT solution yields text instead of throwing', () => {
    // The exact shape found live in PAT-LES-eeeedf0b296b.
    const entry = { solution: { action: 'Continue following LEO Protocol best practices', is_boilerplate: true } };
    const out = solutionToText(entry);
    expect(typeof out).toBe('string');
    expect(() => out.substring(0, 100)).not.toThrow();
  });

  it('[DECIDING] it extracts the REAL content, not a placeholder', () => {
    // Without this, a fix that returned 'See pattern details' for every object would pass the
    // throw-test above while silently deleting the pattern knowledge the prompt exists to carry.
    const entry = { solution: { action: 'Use the pooler URL, never the direct URL' } };
    expect(solutionToText(entry)).toBe('Use the pooler URL, never the direct URL');
  });

  it('[CONTROL] a plain string solution is returned verbatim — the common path is untouched', () => {
    // 196 of 207 usable rows take this path. A fix that mangled them would be a far bigger
    // regression than the bug it replaced, and would look identical in the deciding tests.
    expect(solutionToText({ solution: 'Reuse the existing chokepoint' })).toBe('Reuse the existing chokepoint');
  });

  it('[CONTROL] falls back to .method when .solution is absent', () => {
    expect(solutionToText({ method: 'Run the migration via the DATABASE sub-agent' })).toBe('Run the migration via the DATABASE sub-agent');
  });

  it('[CONTROL] an unrecognised object shape degrades to a marker, never to [object Object]', () => {
    const out = solutionToText({ solution: { unexpected_key: 1 } });
    expect(out).not.toContain('[object Object]');
    expect(typeof out).toBe('string');
    expect(() => out.substring(0, 100)).not.toThrow();
  });

  it("[CONTROL] an empty entry yields '' so the CALLER's default is the single source of that string", () => {
    // Returning 'No proven solution yet' here would put the default in two places and let them drift.
    expect(solutionToText(null)).toBe('');
    expect(solutionToText(undefined)).toBe('');
    expect(solutionToText({})).toBe('');
  });
});
