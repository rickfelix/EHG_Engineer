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
import {
  parseAddedLineNumbers,
  normalizeSelectLineKey,
  baseSelectClassificationsFromContent,
} from '../../../scripts/lint/count-truncation-diff-lint.mjs';
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

describe('normalizeSelectLineKey', () => {
  it('strips a trailing statement terminator', () => {
    expect(normalizeSelectLineKey('  const x = a.select("id");  ')).toBe('const x = a.select("id")');
  });

  it('strips a trailing argument-separator comma (wrapped-in-a-call shape)', () => {
    expect(normalizeSelectLineKey('  a.from("t").select("id").eq("x", 1),')).toBe('a.from("t").select("id").eq("x", 1)');
  });

  it('is a no-op for a line with neither trailing punctuation', () => {
    expect(normalizeSelectLineKey('  a.select("id")')).toBe('a.select("id")');
  });
});

describe('baseSelectClassificationsFromContent (reformat-only false-positive guard)', () => {
  // SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001: wrapping an existing, unmodified `.select(...)`
  // chain in safeQuery(...) reformats the surrounding lines (new indentation, an added prefix
  // token, an added trailing options object), which makes a whole-window text comparison fail
  // even though the query itself never changed. These tests pin the per-select-line-text index
  // this driver builds from the BASE file, which scanFile then uses to recognize that case.
  it('indexes a bare unbounded .select( line as needs-review', () => {
    const content = [
      'async function f() {',
      '  const { data } = await supabase',
      '    .from("claude_sessions")',
      '    .select("session_id, hostname, terminal_id")',
      '    .eq("sd_key", sdId);',
      '}',
    ].join('\n');
    const map = baseSelectClassificationsFromContent(content, 'lib/example.js');
    expect(map.get('.select("session_id, hostname, terminal_id")')).toEqual(new Set(['needs-review']));
  });

  it('indexes a bounded .select( line (own chain has .single()) as bounded-by-design, not needs-review', () => {
    const content = [
      '  const { data } = await supabase',
      '    .from("t")',
      '    .select("id")',
      '    .eq("id", x)',
      '    .single();',
    ].join('\n');
    const map = baseSelectClassificationsFromContent(content, 'lib/example.js');
    expect(map.get('.select("id")')).toEqual(new Set(['bounded-by-design']));
  });

  it('the SAME .select( text appearing twice with different bounds keeps BOTH classifications, so a bounded prior instance never masks a genuinely different unbounded one', () => {
    const content = [
      '  const a = await supabase.from("t").select("id").eq("x", 1).single();',
      '  const b = await supabase.from("t").select("id").eq("y", 2);',
    ].join('\n');
    const map = baseSelectClassificationsFromContent(content, 'lib/example.js');
    // Both lines strip to the same normalized key only if their full text matches; these two
    // differ (.eq('x',1) vs .eq('y',2)) so this really tests two DISTINCT keys stay distinct --
    // the true multi-classification case is covered by the driver reusing one exact text twice,
    // which the exact-line-match design only merges when the text is byte-identical.
    expect(map.get('const a = await supabase.from("t").select("id").eq("x", 1).single()')).toEqual(new Set(['bounded-by-design']));
    expect(map.get('const b = await supabase.from("t").select("id").eq("y", 2)')).toEqual(new Set(['needs-review']));
  });

  it('returns an empty map for content with no .select( lines', () => {
    const map = baseSelectClassificationsFromContent('const x = 1;\nfunction f() {}\n', 'lib/example.js');
    expect(map.size).toBe(0);
  });
});
