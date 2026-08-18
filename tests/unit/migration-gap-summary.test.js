// SD-FDBK-ENH-AUTO-APPLY-MIGRATION-001 FR-4 — conformance gauge pure computation.
import { describe, it, expect } from 'vitest';
import { summarizeGapConformance } from '../../scripts/migration-gap-summary.mjs';

describe('summarizeGapConformance (FR-4)', () => {
  it('14 RECENT gaps with 4 dispositioned reports 10 undispositioned', () => {
    const recentGaps = Array.from({ length: 14 }, (_, i) => ({ file: `database/migrations/gap-${i}.sql` }));
    const dispositionedFiles = recentGaps.slice(0, 4).map((g) => g.file.replace(/^.*\//, ''));
    const state = {
      recentGaps,
      legacyGaps: Array.from({ length: 131 }, (_, i) => ({ file: `legacy-${i}.sql` })),
      dispositions: {
        undispositioned_files: recentGaps.slice(4).map((g) => g.file.replace(/^.*\//, '')),
      },
    };
    const summary = summarizeGapConformance(state);
    expect(summary.recentTotal).toBe(14);
    expect(summary.recentDispositioned).toBe(4);
    expect(summary.recentUndispositioned).toBe(10);
    expect(summary.legacyTotal).toBe(131);
    expect(summary.undispositionedFiles).toHaveLength(10);
    expect(dispositionedFiles.every((f) => !summary.undispositionedFiles.includes(f))).toBe(true);
  });

  it('zero RECENT gaps → all counts zero, no undispositioned files', () => {
    const summary = summarizeGapConformance({ recentGaps: [], legacyGaps: [], dispositions: { undispositioned_files: [] } });
    expect(summary).toEqual({ recentTotal: 0, recentUndispositioned: 0, recentDispositioned: 0, legacyTotal: 0, undispositionedFiles: [] });
  });

  it('all RECENT gaps dispositioned → zero undispositioned', () => {
    const recentGaps = [{ file: 'database/migrations/a.sql' }, { file: 'database/migrations/b.sql' }];
    const summary = summarizeGapConformance({ recentGaps, legacyGaps: [], dispositions: { undispositioned_files: [] } });
    expect(summary.recentTotal).toBe(2);
    expect(summary.recentUndispositioned).toBe(0);
    expect(summary.recentDispositioned).toBe(2);
  });

  it('handles a missing dispositions object without throwing (treats all as undispositioned=false, matches nothing)', () => {
    const summary = summarizeGapConformance({ recentGaps: [{ file: 'x.sql' }] });
    expect(summary.recentTotal).toBe(1);
    expect(summary.recentUndispositioned).toBe(0);
  });
});
