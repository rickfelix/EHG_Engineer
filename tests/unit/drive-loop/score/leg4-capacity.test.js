/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — leg 4 (FR-2): capacity verdict, persisted, inputs uncited.
 *
 * Two properties here are unusual enough to be worth naming, because both look like bugs:
 *   1. row_ids are ABSENT on purpose. The ruling forbids citing inputs.
 *   2. SURPLUS scores ZERO. The ladder is bidirectional; a flooded belt is not a good run.
 * A future reader "fixing" either would break the requirement, so both are asserted directly.
 */

import { describe, it, expect } from 'vitest';
import { scoreLeg4, VERDICTS, HEALTHY_VERDICTS, LEG_POINTS } from '../../../../lib/drive-loop/score/leg4-capacity.js';

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

  it('[BIDIRECTIONAL] SURPLUS scores ZERO — a flooded belt is not a good run', () => {
    // The obvious misreading: treat the top of the ladder as best. SURPLUS is idle capacity against
    // no work, which is off-target in the other direction.
    const { persist } = persister();
    expect(scoreLeg4({ computeVerdict: forecast('SURPLUS'), persist }).points.value).toBe(0);
  });

  it.each(VERDICTS)('%s scores exactly per the healthy set', (v) => {
    const { persist } = persister();
    const r = scoreLeg4({ computeVerdict: forecast(v), persist });
    expect(r.points.value).toBe(HEALTHY_VERDICTS.includes(v) ? LEG_POINTS : 0);
  });

  it('persists even when the verdict scores zero — the record is the deliverable, not the points', () => {
    // A leg that only wrote rows on good runs would make DEFICIT invisible in the trend, which is
    // the exact latent defect FR-2 exists to fix.
    const { rows, persist } = persister();
    scoreLeg4({ computeVerdict: forecast('DEFICIT-URGENT'), persist });
    expect(rows).toHaveLength(1);
    expect(rows[0].verdict).toBe('DEFICIT-URGENT');
  });

  it('an UNRECOGNISED verdict throws rather than scoring zero', () => {
    // Scoring 0 would be indistinguishable from a genuine DEFICIT — a broken instrument would read
    // as a bad week.
    const { persist } = persister();
    expect(() => scoreLeg4({ computeVerdict: forecast('WAT'), persist })).toThrow(/unrecognised verdict/);
    expect(() => scoreLeg4({ computeVerdict: () => ({}), persist })).toThrow(/unrecognised verdict/);
  });

  it('a failing persist fails the leg — no score whose provenance was never written', () => {
    const boom = () => { throw new Error('db down'); };
    expect(() => scoreLeg4({ computeVerdict: forecast('TIGHT'), persist: boom })).toThrow(/db down/);
  });

  it('the unratified healthy set is disclosed in the emission and is injectable', () => {
    const { persist } = persister();
    const strict = scoreLeg4({ computeVerdict: forecast('SURPLUS'), persist });
    expect(strict.points.limitation).toMatch(/HEALTHY SET IS NOT RATIFIED/);
    const lax = scoreLeg4({ computeVerdict: forecast('SURPLUS'), persist, healthy: ['TIGHT', 'SURPLUS'] });
    expect(lax.points.value).toBe(LEG_POINTS);
  });

  it('refuses implicit dependencies rather than shelling out or writing silently', () => {
    expect(() => scoreLeg4({ computeVerdict: forecast('TIGHT') })).toThrow(/must be injected/);
    expect(() => scoreLeg4({ persist: persister().persist })).toThrow(/must be injected/);
  });
});
