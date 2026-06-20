/**
 * SD-LEO-INFRA-PROGRESS-ROLLUP-NEEDLE-PRIORITIZATION-001-E (FR-4) — pure unit tests for the
 * exec-email rung-rollup line: aggregation, honest-null rendering, ordering, and fail-soft.
 */
import { describe, it, expect } from 'vitest';
import { aggregateRungProgress, formatRungRollupLine } from '../../../lib/fleet/exec-email-rung-rollup.js';

describe('aggregateRungProgress', () => {
  it('means non-null progress per rung; excludes unmappable waves', () => {
    const agg = aggregateRungProgress([
      { rung_key: 'V1', progress_pct: 80 },
      { rung_key: 'V1', progress_pct: 96 },
      { rung_key: 'V2', progress_pct: null },
      { rung_key: null, progress_pct: 50 }, // unmappable -> excluded
    ]);
    expect(agg.V1).toEqual({ pct: 88, waves: 2, measured: 2 }); // (80+96)/2
    expect(agg.V2).toEqual({ pct: null, waves: 1, measured: 0 }); // honest-null, never 0
    expect(agg.null).toBeUndefined();
  });

  it('handles empty / non-array input', () => {
    expect(aggregateRungProgress([])).toEqual({});
    expect(aggregateRungProgress(undefined)).toEqual({});
  });
});

describe('formatRungRollupLine', () => {
  const rows = [
    { rung_key: 'V1', progress_pct: 88 },
    { rung_key: 'V2', progress_pct: null },
  ];

  it('renders rungs in V1→V2→V3 order with honest-null for unmeasurable', () => {
    const line = formatRungRollupLine({ ok: true, rows });
    expect(line).toBe('Rung progress (Foundation → revenue): V1 88%  ·  V2 (not yet measurable)');
  });

  it('orders non-standard rung keys deterministically after the canonical ones', () => {
    const line = formatRungRollupLine({ ok: true, rows: [
      { rung_key: 'Z9', progress_pct: 10 },
      { rung_key: 'V1', progress_pct: 50 },
    ] });
    expect(line.indexOf('V1')).toBeLessThan(line.indexOf('Z9'));
  });

  it('FAIL-SOFT: returns empty string for missing/empty/failed rollup (never throws, never breaks the email)', () => {
    expect(formatRungRollupLine(null)).toBe('');
    expect(formatRungRollupLine({ ok: false, rows })).toBe('');
    expect(formatRungRollupLine({ ok: true, rows: [] })).toBe('');
    expect(formatRungRollupLine({ ok: true })).toBe('');
    expect(formatRungRollupLine({ ok: true, rows: [{ rung_key: null, progress_pct: 5 }] })).toBe(''); // all unmappable
  });

  it('a MEASURED 0% renders "0%", NOT "(not yet measurable)" (== null guard, not falsy)', () => {
    // load-bearing honest-null contract: 0 is a real measurement; only null is "unmeasurable"
    const line = formatRungRollupLine({ ok: true, rows: [{ rung_key: 'V1', progress_pct: 0 }] });
    expect(line).toBe('Rung progress (Foundation → revenue): V1 0%');
    expect(line).not.toContain('not yet measurable');
  });
});
