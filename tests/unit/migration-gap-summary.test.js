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
    expect(summary).toEqual({
      recentTotal: 0, recentUndispositioned: 0, recentDispositioned: 0, legacyTotal: 0, undispositionedFiles: [],
      excludedSource: 'absent', excludedTotal: 0, excludedDivergent: [],
    });
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

// SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-D (Option C, TS-6) — a GENUINE consumer of the verifier's
// excluded[] field, not a cosmetic pass-through. The load-bearing case is the second one: an
// `excluded: []`-dropping producer must read differently from a producer that legitimately found
// zero collisions, or this field repeats the exact "wired but inert" defect already live in
// dispositions.contradictory_files (which has no reader anywhere outside the verifier's own
// text-mode branch).
describe('summarizeGapConformance excluded[] consumption (SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-D)', () => {
  const base = { recentGaps: [], legacyGaps: [], dispositions: { undispositioned_files: [] } };

  it('excluded present with zero entries reads as excludedSource="present", excludedTotal=0', () => {
    const summary = summarizeGapConformance({ ...base, excluded: [] });
    expect(summary.excludedSource).toBe('present');
    expect(summary.excludedTotal).toBe(0);
    expect(summary.excludedDivergent).toEqual([]);
  });

  it('excluded field entirely absent (dropped producer field) reads as excludedSource="absent" — NOT the same as zero exclusions', () => {
    const summary = summarizeGapConformance({ ...base });
    expect(summary.excludedSource).toBe('absent');
    expect(summary.excludedTotal).toBe(0);
    expect(summary).not.toHaveProperty('excluded');
  });

  it('names DIVERGENT CONTENT entries explicitly, distinct from byte-identical-copy entries', () => {
    const excluded = [
      { id: 'supabase/migrations/a.sql', twin: 'a.sql', verdict: 'byte-identical copy' },
      { id: 'supabase/migrations/b.sql', twin: 'b.sql', verdict: 'DIVERGENT CONTENT' },
      { id: 'supabase/migrations/c.sql', twin: 'c.sql', verdict: 'content-unreadable' },
    ];
    const summary = summarizeGapConformance({ ...base, excluded });
    expect(summary.excludedTotal).toBe(3);
    expect(summary.excludedDivergent).toEqual([{ id: 'supabase/migrations/b.sql', twin: 'b.sql', verdict: 'DIVERGENT CONTENT' }]);
  });

  it('a malformed (non-array) excluded value is treated as absent rather than throwing', () => {
    const summary = summarizeGapConformance({ ...base, excluded: 'not-an-array' });
    expect(summary.excludedSource).toBe('absent');
    expect(summary.excludedTotal).toBe(0);
  });
});
