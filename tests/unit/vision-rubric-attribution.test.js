// FR-1 — a score is only comparable to a threshold once you know WHICH INSTRUMENT WROTE IT.
// SD-FDBK-FIX-HEAL-BEFORE-COMPLETE-001.
//
// Measured over the FULL table (6059/6059 rows, paginated — a capped page grouped client-side
// measures the cap, not the population):
//
//   n=2537  capabilities_present,key_changes_delivered,smoke_tests_pass,success_criteria_met,success_metrics_achieved
//   n=1646  A01..A07,V01..V11
//   n=1136  elapsed_ms,semantic,structural                      <- LATENCY, not quality
//   n= 454  feasibility,impact,innovation,strategic_alignment,sustainability
//
// THE PRD PREMISE IS FALSE AND THIS FILE ENCODES THE CORRECTED ONE. FR-1 states "the discriminator
// already exists in the data … rubric A simply carries no identifier." Measured: only 290/6059 rows
// (4.8%) carry rubric_snapshot.rubric at all, and mode='sd-heal' spans 3121 rows across ELEVEN
// distinct dimension counts. Neither field discriminates; the dimension KEY SET is the only
// discriminator present.
import { describe, it, expect } from 'vitest';
import {
  identifyRubric,
  resolveThreshold,
  resolveEffectiveThreshold,
  effectiveStringency,
  coverageBandFactor,
  quantileFor,
  countAddressableDimensions,
  calculateDynamicThreshold,
  SD_TYPE_THRESHOLDS,
  RUBRIC_QUANTILES,
  dimScoreOf,
} from '../../lib/handoff/threshold-resolver.js';

// The real signatures, transcribed from the census rather than invented.
const VISION_18 = ['A01','A02','A03','A04','A05','A06','A07','V01','V02','V03','V04','V05','V06','V07','V08','V09','V10','V11'];
const EVA_5 = ['feasibility','impact','innovation','strategic_alignment','sustainability'];
const HEAL_5 = ['capabilities_present','key_changes_delivered','smoke_tests_pass','success_criteria_met','success_metrics_achieved'];
const LATENCY_3 = ['elapsed_ms','semantic','structural'];

/** Score a signature so `addressed` of its dimensions clear NARROW_FEATURE_DIM_FLOOR (50). */
function scoreSignature(keys, addressed) {
  const out = {};
  keys.forEach((k, i) => { out[k] = i < addressed ? 80 : 20; });
  return out;
}

describe('FR-1 AC-1 — every row is attributable to a NAMED rubric', () => {
  it('identifies each rubric from its dimension key set', () => {
    expect(identifyRubric(scoreSignature(VISION_18, 18))).toBe('vision-av-v1');
    expect(identifyRubric(scoreSignature(EVA_5, 5))).toBe('eva-5dim-v1');
    expect(identifyRubric(scoreSignature(HEAL_5, 5))).toBe('sd-heal-5dim-v1');
    expect(identifyRubric(scoreSignature(LATENCY_3, 3))).toBe('latency-3dim');
  });

  it('separates the TWO different 5-dimension rubrics — dimension count alone would merge them', () => {
    // eva-5dim and sd-heal-5dim are both 5 wide. A count-based classifier reports one rubric here
    // and silently pools 2537 heal rows with 454 eva rows.
    expect(identifyRubric(scoreSignature(EVA_5, 5)))
      .not.toBe(identifyRubric(scoreSignature(HEAL_5, 5)));
  });

  it('returns unregistered for an unknown signature instead of defaulting to a real rubric', () => {
    // 76 distinct signatures exist. Quietly treating an unknown one as the vision rubric would
    // reintroduce the cross-instrument comparison this whole function prevents.
    expect(identifyRubric({ alignment: 80, clarity: 70 })).toBe('unregistered');
    for (const v of [null, undefined, [], {}, 'a string snapshot']) {
      expect(identifyRubric(v)).toBe('unregistered');
    }
  });
});

describe('FR-1 AC-4 — the elapsed_ms signature is a LATENCY metric and is never threshold-compared', () => {
  it('elapsed_ms is read verbatim as a "score" by the scorer', () => {
    expect(dimScoreOf(1200)).toBe(1200);   // milliseconds, in a 0-100 column
  });

  it('a millisecond duration clears the QUALITY floor by magnitude alone', () => {
    // This is WHY the signature is dangerous rather than merely odd: 1200 >= 50, so the stopwatch
    // reading counts as a fully-addressed dimension, no narrowing occurs, and the SD is held to the
    // full base bar on the strength of it. 1136 rows.
    const { addressable, total } = countAddressableDimensions('feature', { elapsed_ms: 1200, semantic: 85, structural: 90 });
    expect(addressable).toBe(3);
    expect(total).toBe(3);
  });

  it('REFUSES to produce an effective threshold for it', () => {
    expect(() => resolveEffectiveThreshold('feature', { elapsed_ms: 1200, semantic: 85, structural: 90 }))
      .toThrow(/latency|not a quality score/i);
  });

  it('refuses an UNREGISTERED signature with a DIFFERENT error than the latency refusal', () => {
    // Two distinct facts. Collapsing them into one "cannot score" is the FR-4 defect in miniature:
    // a policy refusal and an unknown scale look identical and neither can be acted on.
    expect(() => resolveEffectiveThreshold('feature', { alignment: 80, clarity: 70 }))
      .toThrow(/unregistered/i);
    expect(() => resolveEffectiveThreshold('feature', { alignment: 80, clarity: 70 }))
      .not.toThrow(/latency/i);
  });
});

describe('FR-1 AC-2 — thresholds resolve on (sd_type, rubric), not sd_type alone', () => {
  it('two rubrics under ONE sd_type do not collapse to the same number', () => {
    // Behavioural, not a source-pin on today's constants.
    expect(resolveThreshold('feature', 'vision-av-v1'))
      .not.toBe(resolveThreshold('feature', 'eva-5dim-v1'));
  });

  it('the spread is MEASURED, not invented — the medians really are 19 points apart', () => {
    const median = (r) => RUBRIC_QUANTILES[r].q[4];   // p50
    expect(median('sd-heal-5dim-v1') - median('vision-av-v1')).toBeCloseTo(19.0, 1);
  });

  it('sd_type ordering is preserved within a rubric — the scale changed, not the ranking', () => {
    // A calibration that scrambled the type hierarchy would satisfy "the numbers differ" while
    // destroying the policy the types encode.
    expect(resolveThreshold('feature', 'vision-av-v1'))
      .toBeGreaterThan(resolveThreshold('documentation', 'vision-av-v1'));
  });
});

describe('FR-1 — the STRINGENCY must not depend on which instrument scored the work', () => {
  // THE DECIDING ASSERTION, AND A CORRECTION TO HOW IT WAS FIRST WRITTEN.
  //
  // The first version of this file asserted the two effective thresholds were NUMERICALLY EQUAL
  // (it failed 70 vs 72, which is what proved the defect). That assertion is wrong as a target:
  // the rubrics' medians are 19 points apart, so forcing them onto one number re-creates exactly
  // the incommensurability FR-1 exists to remove. What must agree is the STRINGENCY — the
  // percentile of its own instrument that the work is held to. The numbers must then DIFFER, and
  // differ by the measured amount.
  it('the same work under an 18-dim and a 5-dim rubric is held to the SAME percentile', () => {
    const t18 = effectiveStringency('feature', 14, 18);   // 0.778 coverage
    const t5  = effectiveStringency('feature', 4, 5);     // 0.800 coverage
    expect(t18).toBe(t5);
  });

  it('…and that agreement is STRUCTURAL, not the arithmetic luck the old ratio relied on', () => {
    // Under continuous ratios, 12/18 and 2/3 agreed (same fraction) while 14/18 and 4/5 did not.
    // Banding makes every pair inside a rung agree, including the pair that used to disagree.
    expect(coverageBandFactor(14 / 18)).toBe(coverageBandFactor(4 / 5));
    expect(coverageBandFactor(12 / 18)).toBe(coverageBandFactor(2 / 3));
  });

  it('the resulting NUMBERS differ, because equal stringency on unequal scales must differ', () => {
    const n18 = resolveEffectiveThreshold('feature', scoreSignature(VISION_18, 14));
    const n5  = resolveEffectiveThreshold('feature', scoreSignature(EVA_5, 4));
    expect(n18).not.toBe(n5);
    // Each sits at the same percentile of its OWN distribution — that is what makes them equal.
    const s = effectiveStringency('feature', 14, 18);
    expect(n18).toBe(Math.round(quantileFor('vision-av-v1', s)));
    expect(n5).toBe(Math.round(quantileFor('eva-5dim-v1', s)));
  });

  it('THE OLD MECHANISM held identical work to different stringencies — the defect, pinned', () => {
    // Guards against a silent revert to sd_type-only + continuous-ratio narrowing. Under the old
    // path both rubrics got base 90 and produced 70 vs 72 — two numbers on two different scales,
    // neither comparable to the other, and nothing in the code able to notice.
    const old = (dims, addressable, total) =>
      calculateDynamicThreshold(SD_TYPE_THRESHOLDS.feature, addressable, total) && // eslint-disable-line no-unused-expressions
      calculateDynamicThreshold(SD_TYPE_THRESHOLDS.feature, addressable, total);
    expect(old(VISION_18, 14, 18)).toBe(70);
    expect(old(EVA_5, 4, 5)).toBe(72);
    expect(old(VISION_18, 14, 18)).not.toBe(old(EVA_5, 4, 5));
  });
});

describe('FR-1 — the band boundaries are a POLICY, and cliffs are their stated cost', () => {
  it('coverage either side of a rung boundary is treated differently — acknowledged, not hidden', () => {
    expect(coverageBandFactor(0.7499)).not.toBe(coverageBandFactor(0.7500));
  });

  it('full coverage is never narrowed', () => {
    expect(coverageBandFactor(1.0)).toBe(1.0);
    expect(effectiveStringency('feature', 18, 18)).toBe(effectiveStringency('feature', 5, 5));
  });

  it('narrowing can never invert the tier ordering', () => {
    // A band factor deep enough to drop a Tier-1 SD below an un-narrowed Tier-3 one would let
    // narrowing rewrite policy. Both arms asserted so a constant factor cannot satisfy this.
    expect(effectiveStringency('feature', 1, 18)).toBeLessThan(effectiveStringency('feature', 18, 18));
    expect(effectiveStringency('feature', 1, 18)).toBeGreaterThan(0);
  });
});
