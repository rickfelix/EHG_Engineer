/**
 * SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-C (FR-3, TS-4) — the escape-budget freeze.
 *
 * The lint has exactly two escape hatches, and both are indistinguishable from a real fix in the
 * final "0 violations" line. Once --all becomes blocking, the cheapest route past a red build stops
 * being "repair the reference" and becomes "add one allowlist line". These tests pin that growth in
 * either budget FAILS, that removal PASSES (a ceiling, not a fixed value), and — the case that
 * matters most — that the failure NAMES what was added, because a bare "budget grew" tells a
 * reviewer nothing about whether the growth was legitimate.
 */
import { describe, it, expect } from 'vitest';
import { compareBudgets, pragmaPathspecs } from '../../../scripts/lint/schema-lint-escape-budget.mjs';

const snap = ({ files = [], tables = [], pragmas = {} }) => ({
  allowlist: { files: files.length, tables: tables.length },
  entries: { files, tables },
  pragmas: new Map(Object.entries(pragmas)),
});

describe('compareBudgets — escape-budget freeze (FR-3)', () => {
  it('TS-4a: an added allowlist TABLES entry fails, and names it', () => {
    const r = compareBudgets(
      snap({ tables: ['a'] }),
      snap({ tables: ['a', 'seeded_growth'] })
    );
    expect(r.ok).toBe(false);
    expect(r.failures.join('\n')).toMatch(/tables.*grew 1 -> 2/);
    expect(r.failures.join('\n')).toContain('seeded_growth');
  });

  it('TS-4b: an added allowlist FILES entry fails, and names it', () => {
    const r = compareBudgets(snap({ files: [] }), snap({ files: ['lib/new-escape.js'] }));
    expect(r.ok).toBe(false);
    expect(r.failures.join('\n')).toContain('lib/new-escape.js');
  });

  it('TS-4c: an added inline pragma fails, and names the file with its before/after count', () => {
    const r = compareBudgets(
      snap({ pragmas: { 'lib/a.js': 1 } }),
      snap({ pragmas: { 'lib/a.js': 1, 'lib/b.js': 1 } })
    );
    expect(r.ok).toBe(false);
    expect(r.failures.join('\n')).toMatch(/pragmas grew 1 -> 2/);
    expect(r.failures.join('\n')).toContain('lib/b.js (0 -> 1)');
  });

  it('TS-4d: a SECOND pragma in an already-suppressed file is still caught', () => {
    // The per-file tally matters: counting distinct FILES would miss this entirely.
    const r = compareBudgets(snap({ pragmas: { 'lib/a.js': 1 } }), snap({ pragmas: { 'lib/a.js': 2 } }));
    expect(r.ok).toBe(false);
    expect(r.failures.join('\n')).toContain('lib/a.js (1 -> 2)');
  });

  it('TS-4e: REMOVING entries passes — the budget is a ceiling, not a fixed value', () => {
    const r = compareBudgets(
      snap({ files: ['x.js'], tables: ['a', 'b'], pragmas: { 'lib/a.js': 3 } }),
      snap({ files: [], tables: ['a'], pragmas: { 'lib/a.js': 1 } })
    );
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it('TS-4f: an unchanged budget passes', () => {
    const s = { files: ['x.js'], tables: ['a'], pragmas: { 'lib/a.js': 2 } };
    expect(compareBudgets(snap(s), snap(s)).ok).toBe(true);
  });

  it('TS-4g: MOVING a pragma between files is NOT caught — the declared blind spot', () => {
    // KNOWN LIMITATION 1 in the script, asserted rather than merely claimed: the total is flat, so
    // re-pointing a suppression at a different violation is invisible to this check. A reader of a
    // green result is entitled to know that, and a test is how the claim stays true.
    const r = compareBudgets(
      snap({ pragmas: { 'lib/a.js': 1 } }),
      snap({ pragmas: { 'lib/b.js': 1 } })
    );
    expect(r.ok).toBe(true);
  });

  it('TS-4h: reports both budgets in the summary regardless of verdict', () => {
    const r = compareBudgets(snap({ tables: ['a'] }), snap({ tables: ['a', 'b'] }));
    expect(r.summary).toEqual({
      allowlist_files: { base: 0, head: 0 },
      allowlist_tables: { base: 1, head: 2 },
      pragmas: { base: 0, head: 0 },
    });
  });
});

describe('pragmaPathspecs — scoped to what the lint actually scans', () => {
  it('covers every runtime dir and code extension, and nothing else', () => {
    const specs = pragmaPathspecs();
    // A pragma outside the scanned set suppresses nothing, so counting it would make the budget
    // respond to files the lint never reads (e.g. a pragma quoted in a test or a doc).
    expect(specs).toContain('lib/**/*.js');
    expect(specs).toContain('scripts/**/*.mjs');
    expect(specs.some((s) => s.startsWith('tests/'))).toBe(false);
    expect(specs.some((s) => s.endsWith('.md'))).toBe(false);
  });
});
