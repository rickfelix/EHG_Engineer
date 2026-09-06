/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — leg 4 (FR-2): capacity verdict, persisted, inputs uncited.
 * SD-LEO-INFRA-DRIVE-SCORE-LEG4-001 — the binary TIGHT-only earning rule is replaced by the
 * chairman-ratified graduated points table (be6e9d73, under ffebbd68).
 *
 * Three properties here are unusual enough to be worth naming, because all three look like bugs:
 *   1. row_ids are ABSENT on purpose. The ruling forbids citing inputs.
 *   2. SURPLUS earns HALF points, not zero. The ladder is bidirectional; a flooded belt is
 *      off-target, not a genuine failure the way DEFICIT-URGENT is.
 *   3. DEFICIT and SURPLUS intentionally earn the SAME value — that is the ratified mapping,
 *      not a collision to "fix".
 * A future reader "fixing" any of these would break the requirement, so all three are asserted directly.
 */

import { describe, it, expect } from 'vitest';
import {
  scoreLeg4, VERDICTS, EARNING_POINTS, LEG_POINTS, LADDER_DISTANCE,
} from '../../../../lib/drive-loop/score/leg4-capacity.js';

const forecast = (verdict, extra = {}) => () => ({
  verdict, beltDepth: 3, demandSoon: 3, deficit: 0, ...extra,
});
/** Records what was written, so "did it persist?" is answered by observation, not assumption. */
function persister() {
  const rows = [];
  return { rows, persist: (r) => { rows.push(r); return { id: `row-${rows.length}` }; } };
}

describe('leg4 — capacity verdict', () => {
  it('[FR-2] persists one durable row per run, with the verdict and its inputs', () => {
    const { rows, persist } = persister();
    const r = scoreLeg4({ computeVerdict: forecast('TIGHT'), persist, runId: 'run-1' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ run_id: 'run-1', verdict: 'TIGHT', belt_depth: 3, deficit: 0 });
    expect(r.verdict_row_id).toBe('row-1');
  });

  it('[FR-2] does NOT cite input rows — absence is the requirement, not an omission', () => {
    // Citing beltDepth's rows would hand an auditor the raw material and make them re-derive the
    // verdict. The ruling: a citation proves where you looked, not the inference.
    const { persist } = persister();
    const r = scoreLeg4({ computeVerdict: forecast('TIGHT'), persist });
    expect(r.points.citation.row_ids).toBeUndefined();
    expect(r.points.predicate, 'the deliberate absence must be stated so it is not read as a gap')
      .toMatch(/INPUT ROWS ARE DELIBERATELY NOT CITED/);
    expect(r.points.predicate).toMatch(/Provenance is the persisted row row-1/);
  });

  it('[BIDIRECTIONAL] SURPLUS earns HALF points, not zero and not full — a flooded belt is off-target, not TIGHT', () => {
    // The obvious misreading: treat the top of the ladder as best (full points) or collapse it back
    // to the old binary rule (zero). Ratified be6e9d73: SURPLUS earns the same as DEFICIT.
    const { persist } = persister();
    const r = scoreLeg4({ computeVerdict: forecast('SURPLUS'), persist });
    expect(r.points.value).toBe(EARNING_POINTS.SURPLUS);
    expect(r.points.value).toBeGreaterThan(0);
    expect(r.points.value).toBeLessThan(LEG_POINTS);
  });

  it.each(VERDICTS)('%s scores exactly per the ratified points table', (v) => {
    const { persist } = persister();
    const r = scoreLeg4({ computeVerdict: forecast(v), persist });
    expect(r.points.value).toBe(EARNING_POINTS[v]);
  });

  // [TS-1..TS-4] exact per-verdict point values, asserted individually (not just via the table
  // lookup above) so a reader can see the ratified mapping without cross-referencing the source.
  it('[TS-1] TIGHT earns the full LEG_POINTS — the target of the ladder', () => {
    const { persist } = persister();
    expect(scoreLeg4({ computeVerdict: forecast('TIGHT'), persist }).points.value).toBe(2);
  });

  it('[TS-2] DEFICIT earns half — one step off-target on the starved side', () => {
    const { persist } = persister();
    expect(scoreLeg4({ computeVerdict: forecast('DEFICIT'), persist }).points.value).toBe(1);
  });

  it('[TS-3] DEFICIT-URGENT earns zero — the worst state on the ladder', () => {
    const { persist } = persister();
    expect(scoreLeg4({ computeVerdict: forecast('DEFICIT-URGENT'), persist }).points.value).toBe(0);
  });

  it('[TS-4] SURPLUS earns half — the SAME as DEFICIT, which is the ratified mapping, not a bug', () => {
    const { persist } = persister();
    const deficit = scoreLeg4({ computeVerdict: forecast('DEFICIT'), persist }).points.value;
    const surplus = scoreLeg4({ computeVerdict: forecast('SURPLUS'), persist }).points.value;
    expect(surplus).toBe(1);
    expect(surplus).toBe(deficit);
  });

  it('[TS-5] at least 3 distinct point values are reachable across the 4 ladder states', () => {
    const { persist } = persister();
    const values = new Set(
      VERDICTS.map((v) => scoreLeg4({ computeVerdict: forecast(v), persist }).points.value)
    );
    expect(values.size).toBeGreaterThanOrEqual(3);
  });

  it('persists even when the verdict scores zero — the record is the deliverable, not the points', () => {
    // A leg that only wrote rows on good runs would make DEFICIT-URGENT invisible in the trend,
    // which is the exact latent defect FR-2 exists to fix.
    const { rows, persist } = persister();
    scoreLeg4({ computeVerdict: forecast('DEFICIT-URGENT'), persist });
    expect(rows).toHaveLength(1);
    expect(rows[0].verdict).toBe('DEFICIT-URGENT');
  });

  it('an UNRECOGNISED verdict throws rather than scoring zero', () => {
    // Scoring 0 would be indistinguishable from a genuine DEFICIT-URGENT — a broken instrument
    // would read as a bad week.
    const { persist } = persister();
    expect(() => scoreLeg4({ computeVerdict: forecast('WAT'), persist })).toThrow(/unrecognised verdict/);
    expect(() => scoreLeg4({ computeVerdict: () => ({}), persist })).toThrow(/unrecognised verdict/);
  });

  it('a failing persist fails the leg — no score whose provenance was never written', () => {
    const boom = () => { throw new Error('db down'); };
    expect(() => scoreLeg4({ computeVerdict: forecast('TIGHT'), persist: boom })).toThrow(/db down/);
  });

  it('[be6e9d73] the ratified points table is disclosed in the emission, with the ratification cited', () => {
    const { persist } = persister();
    const r = scoreLeg4({ computeVerdict: forecast('TIGHT'), persist });
    expect(r.points.predicate).toMatch(/be6e9d73/);
    expect(r.points.limitation).toMatch(/be6e9d73/);
    expect(r.points.limitation).toMatch(/RATIFIED/);
  });

  it('the ratified table is still injectable — a future ratification stays a one-line change', () => {
    const { persist } = persister();
    const overridden = scoreLeg4({
      computeVerdict: forecast('SURPLUS'),
      persist,
      earning: { 'DEFICIT-URGENT': 0, DEFICIT: 1, TIGHT: 2, SURPLUS: 2 },
    });
    expect(overridden.points.value).toBe(2);
    // The default is untouched by a caller passing its own table.
    const defaulted = scoreLeg4({ computeVerdict: forecast('SURPLUS'), persist });
    expect(defaulted.points.value).toBe(EARNING_POINTS.SURPLUS);
  });

  it('refuses implicit dependencies rather than shelling out or writing silently', () => {
    expect(() => scoreLeg4({ computeVerdict: forecast('TIGHT') })).toThrow(/must be injected/);
    expect(() => scoreLeg4({ persist: persister().persist })).toThrow(/must be injected/);
  });

  // TS-6 (PRD SD-LEO-FIX-DRIVE-SCORE-GRADIENT-001, FR-3): ladder_distance is a separate, always-
  // computed telemetry field alongside points/earned — unaffected by the be6e9d73 ratification,
  // which changed points/earned only.

  it.each(VERDICTS)('[TS-6] %s: ladder_distance is present and always computed, alongside the ratified points value', (v) => {
    const { persist } = persister();
    const r = scoreLeg4({ computeVerdict: forecast(v), persist });
    expect(r.points.value).toBe(EARNING_POINTS[v]);
    expect(r.ladder_distance).toBeDefined();
    expect(r.ladder_distance.value).toBe(LADDER_DISTANCE[v]);
  });

  it('[TS-6] ladder_distance differs by state — it is not a constant stand-in for the score', () => {
    const { persist } = persister();
    const values = VERDICTS.map((v) => scoreLeg4({ computeVerdict: forecast(v), persist }).ladder_distance.value);
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  it('ladder_distance discloses ffebbd68 as AUTHORITY-TO-PROPOSE only, never as ratifying this mapping', () => {
    const { persist } = persister();
    const r = scoreLeg4({ computeVerdict: forecast('TIGHT'), persist });
    expect(r.ladder_distance.limitation).toMatch(/NOT RATIFIED/);
    expect(r.ladder_distance.limitation).toMatch(/ffebbd68/);
    expect(r.ladder_distance.limitation).toMatch(/does NOT ratify this mapping/);
  });
});
