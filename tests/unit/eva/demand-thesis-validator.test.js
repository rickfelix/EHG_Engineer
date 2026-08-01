/**
 * SD-FDBK-INFRA-TRUTH-DEMAND-THESIS-001 (TS-3, TS-4) — falsifiability and promotion faithfulness.
 *
 * The standard for every case here: COULD THIS PASS WHILE THE DEFECT IS PRESENT? The defect in
 * question is a thesis that is SHAPED correctly and REFUTABLE nowhere, which is what the existing
 * S21 gate already accepts — so a test asserting the six claims merely EXIST would pass against
 * exactly the thing this validator was built to reject.
 */
import { describe, it, expect } from 'vitest';
import {
  validateDemandThesisFalsifiability,
  verifyPromotionFaithfulness,
  REQUIRED_CLAIMS,
  effectiveEvidenceGrade
} from '../../../lib/eva/demand-thesis-validator.js';

/** Shaped on ApexNiche's real adjudicated thesis, including KILL_CRITERIA's kills-only form. */
function realisticThesis(overrides = {}) {
  const claims = {
    WHO: { statement: 'Niche Content Solopreneur', falsified_by: 'No solopreneur signs up in 14 days', evidence_grade: 'E1' },
    PAIN: { statement: 'Manual niche research is slow', falsified_by: 'Users report research is already fast', evidence_grade: 'E1' },
    ALTERNATIVES: { statement: 'Spreadsheets and manual search', falsified_by: 'A dominant incumbent already solves this', evidence_grade: 'E2' },
    CHANNEL: { channels: ['SEO'], falsified_by: 'Zero qualified traffic from any tested channel', evidence_grade: 'E1' },
    WTP: { price_point: '$29/mo', falsified_by: 'Nobody converts at any tested price', evidence_grade: 'E0' },
    KILL_CRITERIA: {
      kills: [{ kind: 'demand', criterion: 'Dies below 10 qualified signups', threshold: '< 10 qualified signups / 14 probe-days' }]
    },
    ...(overrides.claims || {})
  };
  return { claims };
}

describe('TS-3: falsifiability is enforced, not merely shape', () => {
  it('accepts a thesis modelled on the real adjudicated one', () => {
    const r = validateDemandThesisFalsifiability(realisticThesis());
    expect(r.violations).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.checked).toEqual([...REQUIRED_CLAIMS]);
  });

  it('REJECTS a claim with no falsified_by — the killing mutation', () => {
    const t = realisticThesis();
    delete t.claims.PAIN.falsified_by;
    const r = validateDemandThesisFalsifiability(t);
    expect(r.valid).toBe(false);
    expect(r.violations.map((v) => v.code)).toContain('NOT_FALSIFIABLE');
    expect(r.violations.find((v) => v.code === 'NOT_FALSIFIABLE').claim).toBe('PAIN');
  });

  it('REJECTS an evidence_grade outside the E0-E3 ladder', () => {
    // The existing gate accepts an arbitrary grade of 'B' — proven by
    // stage-22-distribution-setup.test.js:231. That is the hole this closes.
    const t = realisticThesis();
    t.claims.WHO.evidence_grade = 'B';
    const r = validateDemandThesisFalsifiability(t);
    expect(r.valid).toBe(false);
    expect(r.violations.map((v) => v.code)).toContain('EVIDENCE_GRADE_INVALID');
  });

  it('DOES NOT demand falsified_by on KILL_CRITERIA — a uniform rule would force fabrication', () => {
    /**
     * *** THIS TEST EXISTS BECAUSE THE OBVIOUS IMPLEMENTATION IS WRONG. ***
     * ApexNiche's real KILL_CRITERIA carries kills[] and nothing else — by design, since the design
     * doc gives its "falsified by" cell as "(this row is what makes the rest honest)". A uniform
     * "every claim needs falsified_by" validator would either reject the only real thesis in the
     * fleet, or force an author to synthesise a value the source never had — the exact
     * quietly-rewrites-its-source fabrication FR-4 forbids. The validator would have mandated what
     * its sibling requirement prohibits.
     */
    const t = realisticThesis();
    expect(t.claims.KILL_CRITERIA.falsified_by).toBeUndefined();
    expect(t.claims.KILL_CRITERIA.evidence_grade).toBeUndefined();
    expect(validateDemandThesisFalsifiability(t).valid).toBe(true);
  });

  it('but DOES reject a kill with no threshold — unfalsifiable in the same way', () => {
    const t = realisticThesis();
    delete t.claims.KILL_CRITERIA.kills[0].threshold;
    const r = validateDemandThesisFalsifiability(t);
    expect(r.valid).toBe(false);
    expect(r.violations.map((v) => v.code)).toContain('KILL_NO_THRESHOLD');
  });

  it('rejects an empty kills[] — the row that makes the others honest cannot be empty', () => {
    const t = realisticThesis();
    t.claims.KILL_CRITERIA.kills = [];
    expect(validateDemandThesisFalsifiability(t).violations.map((v) => v.code)).toContain('NO_KILLS');
  });

  it('accepts a COMPOUND evidence_grade, resolving to the weakest component', () => {
    /**
     * *** THE FIRST CUT REJECTED THE ONLY REAL THESIS IN THE FLEET ON EXACTLY THIS. ***
     * ApexNiche's adjudicated WTP claim reads "E1-anchor / E0-elicitation" — the adjudicator graded
     * the price anchor and the elicitation separately. Demanding a bare E0-E3 would have forced the
     * backfill to flatten that to a single value: not inventing content, but DISCARDING ADJUDICATED
     * NUANCE to satisfy a validator that assumed a simpler world than the one it validates.
     * Resolves to the WEAKEST component, because a claim is only as grounded as its softest part.
     */
    const t = realisticThesis();
    t.claims.WTP.evidence_grade = 'E1-anchor / E0-elicitation';
    expect(validateDemandThesisFalsifiability(t).valid).toBe(true);
    expect(effectiveEvidenceGrade('E1-anchor / E0-elicitation')).toBe('E0');
    expect(effectiveEvidenceGrade('E2')).toBe('E2');

    // Still rejects a grade naming nothing on the ladder — the widening must not become a hole.
    expect(effectiveEvidenceGrade('B')).toBeNull();
    expect(effectiveEvidenceGrade('strong evidence')).toBeNull();
    t.claims.WTP.evidence_grade = 'anchor / elicitation';
    expect(validateDemandThesisFalsifiability(t).valid).toBe(false);
  });

  it('NEGATIVE CONTROL: a fully-shaped but unrefutable thesis is REJECTED', () => {
    // Every required key present, every claim hollow. This is precisely what the existing S21 gate
    // accepts today, so a validator that passes it would add nothing.
    const hollow = { claims: Object.fromEntries(REQUIRED_CLAIMS.map((k) => [k, { statement: 'something' }])) };
    const r = validateDemandThesisFalsifiability(hollow);
    expect(r.valid).toBe(false);
    expect(r.violations.length).toBeGreaterThanOrEqual(6);
  });

  it('is TOTAL — never throws on malformed input', () => {
    for (const bad of [null, undefined, 42, 'thesis', {}, { claims: null }, { claims: 'x' }]) {
      expect(() => validateDemandThesisFalsifiability(bad)).not.toThrow();
      expect(validateDemandThesisFalsifiability(bad).valid).toBe(false);
    }
  });
});

describe('TS-4: a promotion cites its source, it does not improve it', () => {
  it('flags a claim present in the artifact but absent from the source', () => {
    const source = { WHO: {}, PAIN: {} };
    const artifact = { WHO: {}, PAIN: {}, WTP: {} };
    const r = verifyPromotionFaithfulness(artifact, source);
    expect(r.faithful).toBe(false);
    expect(r.invented).toEqual(['WTP']);
  });

  it('permits FEWER claims than the source — the falsifiability check catches a missing required one', () => {
    // Deliberately one-directional. Dropping is visible and separately caught; INVENTING is the
    // failure that looks like diligence.
    const r = verifyPromotionFaithfulness({ WHO: {} }, { WHO: {}, PAIN: {} });
    expect(r.faithful).toBe(true);
    expect(r.missing).toEqual(['PAIN']);
  });

  it('is TOTAL on malformed input', () => {
    expect(() => verifyPromotionFaithfulness(null, undefined)).not.toThrow();
    expect(verifyPromotionFaithfulness(null, undefined).faithful).toBe(true);
  });
});
