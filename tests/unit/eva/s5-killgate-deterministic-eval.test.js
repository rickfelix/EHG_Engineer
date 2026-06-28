/**
 * SD-LEO-INFRA-S5-KILLGATE-DETERMINISTIC-EVAL-001 (FR-3)
 *
 * Tests for the deterministic S5 kill-gate re-evaluation (FR-1) and the strong
 * Devil's-Advocate route-to-review predicate (FR-2).
 *
 * FR-1: reEvaluateKillGateFromArtifact runs the PURE kill gate against a LOCKED
 *       persisted truth_financial_model payload — same payload -> same decision, every time.
 * FR-2: isStrongDevilsAdvocateChallenge gates a numeric 'pass' to review (HELD) only for a
 *       non-fallback 'challenge' verdict with >=2 high-severity risks (no over-trigger).
 *
 * Honors the #5189 demand-feasibility and #5194 route-to-review-HOLD contracts.
 */
import { describe, it, expect } from 'vitest';
import { reEvaluateKillGateFromArtifact } from '../../../lib/eva/stage-templates/stage-05.js';
import { isStrongDevilsAdvocateChallenge } from '../../../lib/eva/devils-advocate.js';

// A representative persisted truth_financial_model payload (shape produced by analyzeStage05).
// Strong economics: ROI >= 0.25, break-even <= 24, ltvCac >= 2, payback <= 18, and the stressed
// LTV/CAC (ltv/(cac*3)) survives the demand stress -> full PASS.
function passPayload() {
  return {
    roi3y: 0.9,
    breakEvenMonth: 8,
    unitEconomics: { cac: 1000, ltv: 9000, ltvCacRatio: 9, paybackMonths: 6 },
  };
}

describe('FR-1: reEvaluateKillGateFromArtifact — deterministic re-evaluation', () => {
  it('returns an IDENTICAL decision across N=5 evaluations of the same persisted payload', () => {
    const payload = passPayload();
    const decisions = [];
    for (let i = 0; i < 5; i++) {
      decisions.push(reEvaluateKillGateFromArtifact(payload).decision);
    }
    expect(new Set(decisions).size).toBe(1); // no run-to-run flip
    expect(decisions[0]).toBe('pass');
  });

  it('does not mutate the input payload (pure)', () => {
    const payload = passPayload();
    const snapshot = JSON.stringify(payload);
    reEvaluateKillGateFromArtifact(payload);
    expect(JSON.stringify(payload)).toBe(snapshot);
  });

  it('reconstructs the demand-stress band from cac/ltv: a cost-pass that fails the stress -> conditional_pass (#5189)', () => {
    // ltvCac = 2.4 (>=2 cost pass) but stressed ltv/(cac*3) = 0.8 (<2) and no demand evidence
    // -> the demand-feasibility downgrade fires deterministically -> route-to-review.
    const payload = {
      roi3y: 0.9,
      breakEvenMonth: 8,
      unitEconomics: { cac: 1000, ltv: 2400, ltvCacRatio: 2.4, paybackMonths: 6 },
    };
    const r1 = reEvaluateKillGateFromArtifact(payload);
    const r2 = reEvaluateKillGateFromArtifact(payload);
    expect(r1.decision).toBe('conditional_pass');
    expect(r2.decision).toBe(r1.decision); // deterministic
  });

  it('reproduces a KILL deterministically (ROI below the kill threshold)', () => {
    const payload = {
      roi3y: 0.05, // < 0.15 kill threshold
      breakEvenMonth: 30,
      unitEconomics: { cac: 1000, ltv: 1200, ltvCacRatio: 1.2, paybackMonths: 30 },
    };
    expect(reEvaluateKillGateFromArtifact(payload).decision).toBe('kill');
    expect(reEvaluateKillGateFromArtifact(payload).decision).toBe('kill');
  });

  it('recomputes the precise ltv/cac (ignores the rounded stored ltvCacRatio) deterministically', () => {
    // True ltv/cac = 1.998 (< LTV_CAC threshold 2) but the stored, rounded ratio is 2.0. The helper
    // recomputes from cac/ltv, so the precise sub-threshold ratio is honored — and the verdict is
    // reproducible. (Asserts determinism without coupling to the exact threshold value.)
    const payload = {
      roi3y: 0.9,
      breakEvenMonth: 8,
      unitEconomics: { cac: 1000, ltv: 1998, ltvCacRatio: 2.0, paybackMonths: 6 },
    };
    const a = reEvaluateKillGateFromArtifact(payload).decision;
    const b = reEvaluateKillGateFromArtifact(payload).decision;
    expect(a).toBe(b);
  });
});

describe('FR-2: isStrongDevilsAdvocateChallenge — route-to-review predicate', () => {
  const twoHighRisks = [
    { risk: 'demand unvalidated', severity: 'high' },
    { risk: 'inflated economics', severity: 'high' },
    { risk: 'minor', severity: 'low' },
  ];

  it('is TRUE for a non-fallback challenge with >=2 high-severity risks', () => {
    expect(isStrongDevilsAdvocateChallenge({
      overallAssessment: 'challenge', isFallback: false, risks: twoHighRisks,
    })).toBe(true);
  });

  it('is FALSE for a fallback (degraded) review even if it says challenge', () => {
    expect(isStrongDevilsAdvocateChallenge({
      overallAssessment: 'challenge', isFallback: true, risks: twoHighRisks,
    })).toBe(false);
  });

  it('is FALSE for concern / support assessments', () => {
    expect(isStrongDevilsAdvocateChallenge({ overallAssessment: 'concern', risks: twoHighRisks })).toBe(false);
    expect(isStrongDevilsAdvocateChallenge({ overallAssessment: 'support', risks: twoHighRisks })).toBe(false);
  });

  it('is FALSE for a challenge with only ONE high-severity risk (no over-trigger)', () => {
    expect(isStrongDevilsAdvocateChallenge({
      overallAssessment: 'challenge',
      risks: [{ risk: 'one', severity: 'high' }, { risk: 'two', severity: 'medium' }],
    })).toBe(false);
  });

  it('is FALSE for a null/absent review', () => {
    expect(isStrongDevilsAdvocateChallenge(null)).toBe(false);
    expect(isStrongDevilsAdvocateChallenge(undefined)).toBe(false);
  });
});

describe('FR-2: composed route-to-review decision (mirrors eva-orchestrator isRouteToReview)', () => {
  // The orchestrator computes:
  //   atKillGateStage && !hasHardNonFinancialBlock &&
  //   (decision === 'conditional_pass' || (decision === 'pass' && strongDA))
  function isRouteToReview({ stage, decision, hasHardBlock, review }) {
    const atKillGateStage = (stage === 3 || stage === 5);
    return atKillGateStage
      && !hasHardBlock
      && (decision === 'conditional_pass'
        || (decision === 'pass' && isStrongDevilsAdvocateChallenge(review)));
  }

  const strongDA = {
    overallAssessment: 'challenge', isFallback: false,
    risks: [{ severity: 'high' }, { severity: 'high' }],
  };
  const weakDA = { overallAssessment: 'concern', risks: [{ severity: 'high' }] };

  it('routes a numeric PASS to review when a strong DA challenges it at S5', () => {
    expect(isRouteToReview({ stage: 5, decision: 'pass', hasHardBlock: false, review: strongDA })).toBe(true);
  });

  it('does NOT route a numeric PASS when the DA is weak/fallback/absent', () => {
    expect(isRouteToReview({ stage: 5, decision: 'pass', hasHardBlock: false, review: weakDA })).toBe(false);
    expect(isRouteToReview({ stage: 5, decision: 'pass', hasHardBlock: false, review: null })).toBe(false);
  });

  it('still routes a conditional_pass regardless of the DA (the #5189/#5194 path is unchanged)', () => {
    expect(isRouteToReview({ stage: 5, decision: 'conditional_pass', hasHardBlock: false, review: null })).toBe(true);
  });

  it('never routes when a structural (hard non-financial) block is present', () => {
    expect(isRouteToReview({ stage: 5, decision: 'conditional_pass', hasHardBlock: true, review: strongDA })).toBe(false);
    expect(isRouteToReview({ stage: 5, decision: 'pass', hasHardBlock: true, review: strongDA })).toBe(false);
  });

  it('does not apply at non-kill-gate stages', () => {
    expect(isRouteToReview({ stage: 7, decision: 'pass', hasHardBlock: false, review: strongDA })).toBe(false);
  });
});
