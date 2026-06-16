// SD-LEO-INFRA-VISION-GAUGE-HISTORIZE-001 (FR-4) — adversarial tests for the historization append shape
// (buildGaugeRow) and the trend read (computeGaugeTrend). Hermetic: no live DB, no IO.
//
// These are NOT green-by-construction: each trend band MOVES with the signal, the fail-soft path is
// asserted to RECORD a row (never a hole), and the unavailable-point handling is checked end-to-end.
import { describe, it, expect } from 'vitest';
import { buildGaugeRow } from '../../../scripts/vision-gauge-refresh.mjs';
import { computeGaugeTrend, __test } from '../../../lib/vision/gauge-trend.js';

const WRITABLE_KEYS = ['overall_pct', 'available', 'per_layer', 'components', 'denominator', 'total_capabilities', 'unknown_count', 'source'];

describe('FR-4: buildGaugeRow — the append shape (one row per run; id + measured_at default at the DB)', () => {
  it('an AVAILABLE gauge → exactly the 8 writable columns with the computed values', () => {
    const gauge = { overall_pct: 18, available: true, per_layer: { process: 18 }, components: [{ capability: 'x', status: 'partial', score: 0.5 }], denominator: 11, total_capabilities: 25, unknown_count: 14 };
    const row = buildGaugeRow(gauge);
    expect(Object.keys(row).sort()).toEqual([...WRITABLE_KEYS].sort());
    // id + measured_at are intentionally ABSENT — they default at the DB (gen_random_uuid(), now()).
    expect(row).not.toHaveProperty('id');
    expect(row).not.toHaveProperty('measured_at');
    expect(row.overall_pct).toBe(18);
    expect(row.available).toBe(true);
    expect(row.denominator).toBe(11);
    expect(row.total_capabilities).toBe(25);
    expect(row.unknown_count).toBe(14);
    expect(row.source).toBe('vdr');
  });

  it('FAIL-SOFT: a doc-unavailable gauge is RECORDED (available=false, overall_pct=null) — never a missing row', () => {
    const gauge = { overall_pct: null, available: false, per_layer: {}, components: [], denominator: 0, total_capabilities: 0, unknown_count: 0 };
    const row = buildGaugeRow(gauge);
    expect(row).toBeTruthy();                 // a row object IS produced
    expect(row.available).toBe(false);
    expect(row.overall_pct).toBeNull();       // never a fabricated 0
    expect(row.source).toBe('vdr');
  });

  it('defaults are honest: missing numeric fields → 0, missing containers → {} / [], overall_pct → null', () => {
    const row = buildGaugeRow({ available: true });
    expect(row.overall_pct).toBeNull();
    expect(row.per_layer).toEqual({});
    expect(row.components).toEqual([]);
    expect(row.denominator).toBe(0);
    expect(row.total_capabilities).toBe(0);
    expect(row.unknown_count).toBe(0);
  });

  it('null/undefined gauge → a fail-soft unavailable row (never throws, never a hole)', () => {
    const row = buildGaugeRow(undefined);
    expect(row.available).toBe(false);
    expect(row.overall_pct).toBeNull();
    expect(Object.keys(row).sort()).toEqual([...WRITABLE_KEYS].sort());
  });
});

// helper: build N ascending hourly snapshots from a pct array (null pct ⇒ unavailable run)
function snaps(pcts, startHour = 0) {
  return pcts.map((p, i) => ({
    overall_pct: p,
    available: p != null,
    measured_at: `2026-06-16T${String(startHour + i).padStart(2, '0')}:17:00.000Z`,
  }));
}

describe('FR-4: computeGaugeTrend — building-history fallbacks (<2 snapshots, never a fabricated trend)', () => {
  it('0 snapshots → "building history (no snapshots yet)", no analysis', () => {
    const t = computeGaugeTrend([]);
    expect(t.trendLine).toMatch(/building history \(no snapshots yet\)/);
    expect(t.analysisLine).toBeNull();
  });
  it('1 snapshot → "building history (1 snapshot)", no analysis', () => {
    const t = computeGaugeTrend(snaps([18]));
    expect(t.trendLine).toMatch(/building history \(1 snapshot\)/);
    expect(t.analysisLine).toBeNull();
  });
  it('non-array input → fail-soft building-history (never throws)', () => {
    expect(computeGaugeTrend(null).trendLine).toMatch(/building history/);
    expect(computeGaugeTrend(undefined).trendLine).toMatch(/building history/);
  });
});

describe('FR-4: computeGaugeTrend — the delta MOVES with the signal (adversarial)', () => {
  it('rising → positive delta vs prior run + "rose" analysis; sparkline has one bar per run', () => {
    const t = computeGaugeTrend(snaps([10, 12, 15, 18]));
    expect(t.trendLine).toMatch(/18% \(\+3 vs prior run, 4 runs\)/);
    expect(t.analysisLine).toMatch(/rose 10% → 18% over the last 4 runs/);
    // 4 runs → 4 sparkline glyphs
    const spark = t.trendLine.match(/trend: (\S+) /)[1];
    expect([...spark]).toHaveLength(4);
  });
  it('falling → negative delta + "fell" analysis', () => {
    const t = computeGaugeTrend(snaps([22, 20, 18]));
    expect(t.trendLine).toMatch(/18% \(-2 vs prior run, 3 runs\)/);
    expect(t.analysisLine).toMatch(/fell 22% → 18% over the last 3 runs/);
  });
  it('flat → 0 delta + "held flat" analysis', () => {
    const t = computeGaugeTrend(snaps([18, 18, 18]));
    expect(t.trendLine).toMatch(/18% \(0 vs prior run, 3 runs\)/);
    expect(t.analysisLine).toMatch(/held flat at 18%/);
  });
  it('input order independence: DESC (DB order) yields the SAME current/prior as ASC', () => {
    const asc = snaps([10, 14, 19]);
    const desc = asc.slice().reverse();
    expect(computeGaugeTrend(desc).trendLine).toBe(computeGaugeTrend(asc).trendLine);
    expect(computeGaugeTrend(desc).trendLine).toMatch(/19% \(\+5 vs prior run, 3 runs\)/);
  });
});

describe('FR-4: computeGaugeTrend — unavailable runs are honest (gap, excluded from delta, counted)', () => {
  it('a middle unavailable run → sparkline gap + counted in analysis, not treated as 0%', () => {
    const t = computeGaugeTrend(snaps([12, null, 16, 18])); // run 2 unavailable
    expect(t.trendLine).toContain('·');                      // gap glyph, not a 0% bar
    expect(t.trendLine).toMatch(/18% \(\+2 vs prior run, 4 runs\)/); // delta uses 16→18 (real runs)
    expect(t.analysisLine).toMatch(/\(1 unavailable\)/);
    expect(t.analysisLine).toMatch(/rose 12% → 18% over the last 4 runs/);
  });
  it('the IMMEDIATELY-prior run unavailable → "delta n/a (prior run unavailable)" (no overstatement to an older run)', () => {
    const t = computeGaugeTrend(snaps([12, 14, null, 18])); // prior (run 3) unavailable, current (run 4) ok
    expect(t.trendLine).toMatch(/18% \(delta n\/a — prior run unavailable, 4 runs\)/);
  });
  it('the CURRENT run unavailable → "current run unavailable" (no fabricated headline %)', () => {
    const t = computeGaugeTrend(snaps([18, 18, null])); // newest unavailable
    expect(t.trendLine).toMatch(/current run unavailable \(3 runs\)/);
  });
  it('fewer than 2 MEASURABLE runs in the window → honest "only N measurable" analysis', () => {
    const t = computeGaugeTrend(snaps([null, null, 18])); // only 1 available
    expect(t.analysisLine).toMatch(/only 1 measurable run\(s\) in the last 3/);
  });
  it('an unparseable measured_at is dropped (deterministic, never NaN-sorted)', () => {
    const bad = [{ overall_pct: 10, available: true, measured_at: 'not-a-date' }, ...snaps([14, 19])];
    // the bad row is dropped → behaves like the 2 valid rows → +5 delta
    expect(computeGaugeTrend(bad).trendLine).toMatch(/19% \(\+5 vs prior run, 2 runs\)/);
  });
});

describe('FR-4: sparkline glyph mapping is absolute 0..100 (direct, not just length)', () => {
  it('bar() maps the band edges + clamps out-of-range honestly', () => {
    const { bar, BARS, GAP } = __test;
    expect(bar(0)).toBe(BARS[0]);            // ▁
    expect(bar(100)).toBe(BARS[BARS.length - 1]); // █
    expect(bar(50)).toBe(BARS[Math.round(0.5 * (BARS.length - 1))]); // mid
    expect(bar(-5)).toBe(BARS[0]);           // clamp low
    expect(bar(150)).toBe(BARS[BARS.length - 1]); // clamp high
    expect(bar(null)).toBe(GAP);             // unavailable → gap, never a 0% bar
    expect(bar(NaN)).toBe(GAP);
  });
});
