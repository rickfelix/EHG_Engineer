/**
 * QF-20260728-427 — count-truncation-diff-lint.mjs.
 *
 * parseAddedLineNumbers is pure (no git, no I/O) so it's tested directly against synthetic
 * unified-diff text. The classification wiring (classifyChain/isNonLivePath/chainWindow,
 * imported verbatim from scripts/audit/count-truncation-inventory.mjs) is re-verified here only
 * to confirm the new needs-review-blocking behavior this driver adds — the classifier's own
 * heuristics are that file's responsibility, not re-tested here.
 */
import { describe, it, expect } from 'vitest';
import { parseAddedLineNumbers } from '../../../scripts/lint/count-truncation-diff-lint.mjs';
import { classifyChain, chainWindow } from '../../../scripts/audit/count-truncation-inventory.mjs';

describe('parseAddedLineNumbers', () => {
  it('collects new-file line numbers from + lines in a single hunk', () => {
    const diff = [
      '@@ -10,0 +11,3 @@',
      '+const rows = await sb.from("t").select("*");',
      '+console.log(rows);',
      '+// trailing',
    ].join('\n');
    expect(parseAddedLineNumbers(diff)).toEqual(new Set([11, 12, 13]));
  });

  it('advances past context and removed lines without counting them as added', () => {
    const diff = [
      '@@ -5,2 +5,3 @@',
      ' const a = 1;',
      '-const b = 2;',
      '+const b = 3;',
      '+const c = 4;',
    ].join('\n');
    // context line 5 (unchanged) -> cur becomes 6; removed line does not advance new-side cur;
    // "+const b = 3;" lands at 6, "+const c = 4;" at 7.
    expect(parseAddedLineNumbers(diff)).toEqual(new Set([6, 7]));
  });

  it('handles multiple hunks independently', () => {
    const diff = [
      '@@ -1,0 +2,1 @@',
      '+first',
      '@@ -20,0 +30,1 @@',
      '+second',
    ].join('\n');
    expect(parseAddedLineNumbers(diff)).toEqual(new Set([2, 30]));
  });

  it('returns an empty set for empty or non-diff text', () => {
    expect(parseAddedLineNumbers('')).toEqual(new Set());
    expect(parseAddedLineNumbers('not a diff')).toEqual(new Set());
  });

  it('ignores +++/--- file-header lines', () => {
    const diff = ['--- a/f.js', '+++ b/f.js', '@@ -1,0 +1,1 @@', '+x'].join('\n');
    expect(parseAddedLineNumbers(diff)).toEqual(new Set([1]));
  });
});

describe('classification wiring this driver relies on', () => {
  it('a bare unbounded .select( classifies as needs-review (the case this driver blocks on)', () => {
    const lines = ['const { data } = await supabase.from("claude_sessions").select("*");'];
    expect(classifyChain(chainWindow(lines, 0))).toBe('needs-review');
  });

  it('a bounded .limit(N<1000) does not classify as needs-review', () => {
    const lines = ['const { data } = await supabase.from("claude_sessions").select("*").limit(50);'];
    expect(classifyChain(chainWindow(lines, 0))).toBe('bounded-by-design');
  });

  it("QF-20260823-555: count: 'estimated'/'planned' classify as already-exact, same as 'exact' (all three are HEAD-count-only, no rows returned)", () => {
    const est = ['const { count } = await supabase.from("t").select("*", { count: "estimated", head: true }).lt("c", x);'];
    const planned = ['const { count } = await supabase.from("t").select("*", { count: "planned", head: true }).lt("c", x);'];
    expect(classifyChain(chainWindow(est, 0))).toBe('already-exact');
    expect(classifyChain(chainWindow(planned, 0))).toBe('already-exact');
  });
});
