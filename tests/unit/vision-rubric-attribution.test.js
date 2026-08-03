// FR-1 — a score is only comparable to a threshold once you know WHICH INSTRUMENT WROTE IT.
// SD-FDBK-FIX-HEAL-BEFORE-COMPLETE-001.
//
// eva_vision_scores.total_score is written by several incommensurable instruments and read as one
// number. Measured over the FULL table (6059/6059 rows, not a sampled page):
//
//   n=2537  5 dims  capabilities_present, key_changes_delivered, smoke_tests_pass, …   (heal completeness)
//   n=1646 18 dims  A01..A07, V01..V11                                                  (vision rubric)
//   n=1136  3 dims  elapsed_ms, semantic, structural                                    (LATENCY, not quality)
//   n= 454  5 dims  feasibility, impact, innovation, strategic_alignment, sustainability (eva-5dim-v1)
//
// THE PRD PREMISE IS FALSE AND THIS FILE ENCODES THE CORRECTED ONE. FR-1 states "the discriminator
// already exists in the data … rubric A simply carries no identifier." Measured: only 290 / 6059
// rows (4.8%) carry rubric_snapshot.rubric at all, and mode='sd-heal' spans 3121 rows across ELEVEN
// distinct dimension counts (5d:1322, 3d:1139, 18d:638) — one label covering the heal rubric, the
// latency signature and the vision rubric simultaneously. Neither field discriminates. The only
// discriminator actually present today is the DIMENSION KEY SET.
import { describe, it, expect } from 'vitest';
import {
  countAddressableDimensions,
  calculateDynamicThreshold,
  SD_TYPE_THRESHOLDS,
  dimScoreOf,
} from '../../lib/handoff/threshold-resolver.js';

// The four real signatures, transcribed from the census rather than invented.
const VISION_18 = ['A01','A02','A03','A04','A05','A06','A07','V01','V02','V03','V04','V05','V06','V07','V08','V09','V10','V11'];
const EVA_5 = ['feasibility','impact','innovation','strategic_alignment','sustainability'];
const LATENCY_3 = ['elapsed_ms','semantic','structural'];

/** Score a signature so that `addressedCount` of its dimensions clear NARROW_FEATURE_DIM_FLOOR (50). */
function scoreSignature(keys, addressedCount) {
  const out = {};
  keys.forEach((k, i) => { out[k] = i < addressedCount ? 80 : 20; });
  return out;
}

/** The number the gate ACTUALLY compares a score against, end to end. */
function effectiveThreshold(sdType, dimensionScores, sdMetadata = null) {
  const base = SD_TYPE_THRESHOLDS[sdType] ?? SD_TYPE_THRESHOLDS._default;
  const { addressable, total } = countAddressableDimensions(sdType, dimensionScores, sdMetadata);
  return calculateDynamicThreshold(base, addressable, total);
}

describe('FR-1 AC-4 — the 3-dim elapsed_ms signature is a LATENCY metric and must never be threshold-compared', () => {
  // n=1136 rows. elapsed_ms is a DURATION IN MILLISECONDS sitting in the same JSONB column as
  // 0-100 quality scores. Nothing in the resolver knows the difference.
  it('elapsed_ms is not a 0-100 quality score, and the resolver currently reads it as one', () => {
    expect(dimScoreOf(1200)).toBe(1200);   // a millisecond duration, read as a "score"
  });

  it('REFUSES to produce an effective threshold for a latency signature', () => {
    // THE DECIDING BEHAVIOUR. On current main this signature sails through: every dimension
    // "scores" >= 50 (1200ms trivially clears a floor meant for quality points), so all three read
    // as addressable, no narrowing occurs, and the SD is held to the FULL base bar on the strength
    // of a stopwatch reading. The gate must reject the signature outright, not score it.
    const latency = { elapsed_ms: 1200, semantic: 85, structural: 90 };
    expect(() => effectiveThreshold('feature', latency))
      .toThrow(/latency|not a quality score|non-comparable/i);
  });
});

describe('FR-1 — the effective threshold must not depend on WHICH INSTRUMENT scored the work', () => {
  // THE DECIDING ASSERTION. Asserts the FINAL EFFECTIVE VALUE — the number actually compared
  // against total_score — never an intermediate. A test on the base threshold alone would pass
  // while the narrowing step reintroduced the whole disagreement one line later.
  it('the same work under an 18-dim and a 5-dim rubric yields the SAME effective bar', () => {
    // "The same work": it meaningfully addresses ~80% of whatever scope its rubric enumerates.
    const under18 = scoreSignature(VISION_18, 14);  // 14/18 = 0.778
    const under5  = scoreSignature(EVA_5, 4);       //  4/5  = 0.800

    const t18 = effectiveThreshold('feature', under18);
    const t5  = effectiveThreshold('feature', under5);

    // On current main these are 70 and 72: the bar moves because an 18-dim instrument can express
    // fractions a 5-dim instrument cannot. The work did not change; the ruler did.
    expect(t18).toBe(t5);
  });

  it('a rubric with MORE dimensions does not mechanically lower the bar for identical coverage', () => {
    // Same proportion addressed (2/3) expressed at two granularities. Any rubric-blind
    // ratio-narrowing makes these agree by luck here and disagree elsewhere; the fix must make
    // agreement structural rather than coincidental.
    const coarse = scoreSignature(['a','b','c'], 2);
    const fine   = scoreSignature(VISION_18, 12);
    expect(effectiveThreshold('feature', coarse)).toBe(effectiveThreshold('feature', fine));
  });
});

describe('FR-1 AC-2 — thresholds resolve on (sd_type, rubric), not sd_type alone', () => {
  it('the resolver accepts a rubric identity and DISCRIMINATES on it', async () => {
    // Behavioural, not a source-pin on today's constants: two named rubrics for ONE sd_type must
    // not collapse to the same base number, because a 5-dim 80 and an 18-dim 80 are not the
    // same claim about the work.
    const mod = await import('../../lib/handoff/threshold-resolver.js');
    expect(typeof mod.resolveThreshold).toBe('function');
    expect(mod.resolveThreshold('feature', 'vision-18dim-v1'))
      .not.toBe(mod.resolveThreshold('feature', 'eva-5dim-v1'));
  });
});

describe('FR-1 AC-1 — every row is attributable to a NAMED rubric', () => {
  it('identifies a rubric from its dimension key set, since 95.2% of rows declare none', () => {
    // The backfill discriminator. mode= cannot serve: it spans 11 dimension counts.
    const mod = require('../../lib/handoff/threshold-resolver.js');
    expect(mod.identifyRubric(scoreSignature(VISION_18, 18))).toBe('vision-18dim-v1');
    expect(mod.identifyRubric(scoreSignature(EVA_5, 5))).toBe('eva-5dim-v1');
    expect(mod.identifyRubric(scoreSignature(LATENCY_3, 3))).toBe('latency-3dim');
  });
});
