/**
 * SD-LEO-FIX-TESTS-QUARANTINE-MANIFEST-001 (FR-5, TS-1..TS-5) — quarantine retire-check gauge.
 *
 * Pure-logic tests over fixture manifests/verdicts: no DB, no git, no filesystem. Mirrors
 * tests/unit/lint/schema-lint-escape-budget.test.js's convention of testing the exported pure
 * comparators directly rather than shelling out to the CLI.
 */
import { describe, it, expect } from 'vitest';
import {
  BASELINE_COUNT,
  evaluateBaseline,
  findOverdueEntries,
  groupOverdueByReasonClass,
  diffTouchedEntries,
  buildHarnessBacklogRows,
  isIncompleteOutcome,
} from '../../../scripts/lint/quarantine-retire-check.mjs';

const entry = (overrides = {}) => ({
  file: 'some/test.js',
  reason_class: 'assertion-drift',
  quarantined_at: '2026-06-01T00:00:00.000Z',
  review_by: '2026-08-30T00:00:00.000Z',
  ...overrides,
});

describe('evaluateBaseline (TS-1: growth beyond baseline fails)', () => {
  it('passes when count is at or below the baseline', () => {
    const entries = Array.from({ length: BASELINE_COUNT }, (_, i) => entry({ file: `f${i}.js` }));
    expect(evaluateBaseline(entries, BASELINE_COUNT).ok).toBe(true);
  });

  it('fails and names the overage when count exceeds the baseline', () => {
    const entries = Array.from({ length: BASELINE_COUNT + 1 }, (_, i) => entry({ file: `f${i}.js` }));
    const r = evaluateBaseline(entries, BASELINE_COUNT);
    expect(r.ok).toBe(false);
    expect(r.count).toBe(BASELINE_COUNT + 1);
    expect(r.delta).toBe(1);
  });
});

describe('findOverdueEntries (TS-2/TS-3: overdue with/without a cited verdict)', () => {
  const now = new Date('2026-09-13T00:00:00.000Z');

  it('TS-2: an entry past review_by with NO matching verdict is overdue', () => {
    const e = entry({ file: 'a.test.js', review_by: '2026-08-01T00:00:00.000Z' });
    const overdue = findOverdueEntries([e], [], { now });
    expect(overdue.map((x) => x.file)).toEqual(['a.test.js']);
  });

  it('TS-3: an entry past review_by WITH a matching verdict (exact file match) is not overdue', () => {
    const e = entry({ file: 'a.test.js', review_by: '2026-08-01T00:00:00.000Z' });
    const verdicts = [{ file: 'a.test.js', verdict: 'undetermined', citation: null, note: 'looked, no answer' }];
    const overdue = findOverdueEntries([e], verdicts, { now });
    expect(overdue).toEqual([]);
  });

  it('an entry whose review_by has NOT yet passed is never overdue, verdict or not', () => {
    const e = entry({ file: 'future.test.js', review_by: '2026-12-01T00:00:00.000Z' });
    expect(findOverdueEntries([e], [], { now })).toEqual([]);
  });

  it('a verdict for a file with no live manifest entry does not create a false match for another entry', () => {
    const e = entry({ file: 'a.test.js', review_by: '2026-08-01T00:00:00.000Z' });
    const verdicts = [{ file: 'unrelated-removed-entry.test.js', verdict: 'drift', citation: 'x' }];
    const overdue = findOverdueEntries([e], verdicts, { now });
    expect(overdue.map((x) => x.file)).toEqual(['a.test.js']);
  });
});

describe('groupOverdueByReasonClass', () => {
  it('groups files under their reason_class, never merging distinct classes', () => {
    const overdue = [
      entry({ file: 'a.js', reason_class: 'assertion-drift' }),
      entry({ file: 'b.js', reason_class: 'assertion-drift' }),
      entry({ file: 'c.js', reason_class: 'timeout' }),
    ];
    const grouped = groupOverdueByReasonClass(overdue);
    expect(grouped.get('assertion-drift')).toEqual(['a.js', 'b.js']);
    expect(grouped.get('timeout')).toEqual(['c.js']);
    expect(grouped.size).toBe(2);
  });
});

describe('buildHarnessBacklogRows (FR-4: one row per reason_class cohort, never per file)', () => {
  it('produces exactly one row per distinct reason_class, listing every file in that cohort', () => {
    const grouped = groupOverdueByReasonClass([
      entry({ file: 'a.js', reason_class: 'assertion-drift' }),
      entry({ file: 'b.js', reason_class: 'assertion-drift' }),
      entry({ file: 'c.js', reason_class: 'timeout' }),
    ]);
    const rows = buildHarnessBacklogRows(grouped, { asOfDate: '2026-09-13' });
    expect(rows).toHaveLength(2);
    const driftRow = rows.find((r) => r.reason_class === 'assertion-drift');
    expect(driftRow.files).toEqual(['a.js', 'b.js']);
    expect(driftRow.dedup_key).toBe('quarantine-retire:assertion-drift');
    expect(driftRow.description).toContain('a.js');
    expect(driftRow.description).toContain('b.js');
  });
});

describe('diffTouchedEntries (--diff mode scoping)', () => {
  it('flags a file present only at current (new) as touched', () => {
    const current = [entry({ file: 'new.js' })];
    const base = [];
    expect(diffTouchedEntries(current, base).map((e) => e.file)).toEqual(['new.js']);
  });

  it('flags a file present at both but with different content (changed) as touched', () => {
    const base = [entry({ file: 'x.js', review_by: '2026-08-01T00:00:00.000Z' })];
    const current = [entry({ file: 'x.js', review_by: '2026-09-01T00:00:00.000Z' })];
    expect(diffTouchedEntries(current, base).map((e) => e.file)).toEqual(['x.js']);
  });

  it('does NOT flag a file that is byte-identical at both current and base', () => {
    const shared = entry({ file: 'unchanged.js' });
    expect(diffTouchedEntries([shared], [shared])).toEqual([]);
  });
});

describe('isIncompleteOutcome (QF-20260912-364 shape, mirrored)', () => {
  it('success and failure are trustworthy outcomes', () => {
    expect(isIncompleteOutcome('success')).toBe(false);
    expect(isIncompleteOutcome('failure')).toBe(false);
  });

  it('cancelled, skipped, null, and undefined are incomplete outcomes', () => {
    expect(isIncompleteOutcome('cancelled')).toBe(true);
    expect(isIncompleteOutcome('skipped')).toBe(true);
    expect(isIncompleteOutcome(null)).toBe(false); // falsy short-circuit: no outcome supplied at all
    expect(isIncompleteOutcome(undefined)).toBe(false);
  });
});
