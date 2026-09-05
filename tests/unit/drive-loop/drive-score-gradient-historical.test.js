/**
 * [TS-9] SD-LEO-FIX-DRIVE-SCORE-GRADIENT-001 — leg2 + leg4 re-scored against the 20-row
 * drive_reports historical sample captured during PLAN (tests/fixtures/drive-score/
 * drive-reports-historical-sample.json), verifying the gradient this SD introduces actually
 * separates real historical readings rather than only synthetic edge cases.
 *
 * The fixture records OUTCOMES (leg2_uptake, leg2_grains, leg4_capacity), not the raw inputs
 * (rankedTop5/claim_history, capacity-forecast objects) the real scorers consume — those are not
 * persisted anywhere. Inputs are reconstructed from the recorded outcome under the OLD binary rule's
 * own constraint, documented at each reconstruction below, rather than invented arbitrarily.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreLeg2, GRAIN_FLOOR } from '../../../lib/drive-loop/score/leg2-uptake.js';
import { scoreLeg4 } from '../../../lib/drive-loop/score/leg4-capacity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirname, '../../fixtures/drive-score/drive-reports-historical-sample.json');
const HISTORICAL = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const NOW = Date.parse('2026-09-05T12:00:00Z');

/**
 * Reconstructs a rankedTop5 input whose claimed count is exactly `grains`. The OLD binary rule
 * (fraction >= 0.8) required fraction===1.0 to reach its recorded ceiling of 2 whenever grains was
 * small (grains=1 -> 1/1; grains=2 -> a denominator of 2 gives exactly the 0.8 boundary only at
 * fraction=1.0 too, since 1/2=0.5 < 0.8) -- every ceiling-day, denominator equals grains. That is
 * the ONLY input shape consistent with the recorded (grains, ceiling-score) pair, so it is a
 * derivation, not an assumption.
 */
const rankedForGrains = (n) => Array.from({ length: n }, (_, i) => ({
  id: `sd${i}`,
  metadata: { claim_history: [{ claimed_at: new Date(NOW).toISOString() }] },
}));

const persist = () => ({ id: 'row-1' });

describe('[TS-9] leg2 re-scored against the historical sample', () => {
  const ceilingDays = HISTORICAL.filter((r) => r.leg2_uptake === 2 && Number.isFinite(r.leg2_grains));

  it('the fixture actually contains ceiling-scoring days with a recorded grain count', () => {
    expect(ceilingDays.length).toBeGreaterThan(0);
  });

  it('re-scoring every historical ceiling day under the new formula produces >= 3 distinct values', () => {
    const rescored = ceilingDays.map(
      (r) => scoreLeg2({ rankedTop5: rankedForGrains(r.leg2_grains), nowMs: NOW }).points.value,
    );
    expect(new Set(rescored).size).toBeGreaterThanOrEqual(3);
  });

  it('a single-grain historical ceiling day (the exact defect this SD fixes) now scores strictly below the old ceiling of 2', () => {
    const singleGrainDays = ceilingDays.filter((r) => r.leg2_grains === 1);
    expect(singleGrainDays.length).toBeGreaterThan(0); // confirms the defect was real, not hypothetical
    const rescored = scoreLeg2({ rankedTop5: rankedForGrains(1), nowMs: NOW }).points.value;
    expect(rescored).toBeLessThan(2);
  });

  it('a well-sampled historical ceiling day (grains >= GRAIN_FLOOR) still reports the unchanged ceiling of 2', () => {
    const wellSampledDays = ceilingDays.filter((r) => r.leg2_grains >= GRAIN_FLOOR);
    expect(wellSampledDays.length).toBeGreaterThan(0);
    const rescored = scoreLeg2({ rankedTop5: rankedForGrains(wellSampledDays[0].leg2_grains), nowMs: NOW }).points.value;
    expect(rescored).toBe(2);
  });
});

describe('[TS-9] leg4 re-scored against the historical sample', () => {
  it('the recorded TIGHT-scoring historical days (leg4_capacity=2) reproduce byte-identically, alongside the new telemetry field', () => {
    const tightDays = HISTORICAL.filter((r) => r.leg4_capacity === 2);
    expect(tightDays.length).toBeGreaterThan(0); // 3 known dates: 2026-08-19, 08-21, 08-24
    for (const day of tightDays) {
      const r = scoreLeg4({ computeVerdict: () => ({ verdict: 'TIGHT', beltDepth: 0, demandSoon: 0, deficit: 0 }), persist });
      expect(r.points.value).toBe(day.leg4_capacity); // byte-identical to the historical score
      expect(r.ladder_distance.value).toBe(0); // TIGHT is the ladder's zero point
    }
  });

  it('the recorded non-TIGHT historical days (leg4_capacity=0) reproduce byte-identically regardless of WHICH non-healthy verdict occurred', () => {
    // The fixture records only the binary score, not which of the 3 non-healthy ladder states
    // produced it. Scoring is identical across all three (HEALTHY_VERDICTS=['TIGHT']), so this
    // asserts that unchanged equivalence -- not a claim about a specific historical verdict this
    // fixture has no record of.
    const nonTightDays = HISTORICAL.filter((r) => r.leg4_capacity === 0);
    expect(nonTightDays.length).toBeGreaterThan(0);
    for (const standIn of ['DEFICIT-URGENT', 'DEFICIT', 'SURPLUS']) {
      const r = scoreLeg4({ computeVerdict: () => ({ verdict: standIn, beltDepth: 0, demandSoon: 0, deficit: 0 }), persist });
      expect(r.points.value).toBe(0);
      expect(r.ladder_distance.value).toBeLessThan(0); // every non-TIGHT state is off the ladder's zero point
    }
  });
});
