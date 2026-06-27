import { describe, it, expect } from 'vitest';
import TEMPLATE, {
  ROI_PASS_THRESHOLD,
  ROI_CONDITIONAL_THRESHOLD,
  MAX_BREAKEVEN_MONTHS,
  LTV_CAC_THRESHOLD,
  PAYBACK_THRESHOLD,
  CONDITIONAL_LTV_CAC_THRESHOLD,
  CONDITIONAL_PAYBACK_THRESHOLD,
  DEMAND_CAC_STRESS_MULTIPLIER,
  DEMAND_STRESSED_LTV_CAC_THRESHOLD,
  evaluateKillGate,
} from '../../../../lib/eva/stage-templates/stage-05.js';

describe('stage-05 — Kill Gate (Financial)', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-05');
    expect(TEMPLATE.slug).toBe('profitability');
    expect(TEMPLATE.title).toBe('Kill Gate (Financial)');
    expect(TEMPLATE.version).toBe('2.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(d).toHaveProperty('initialInvestment');
    expect(d).toHaveProperty('year1');
    expect(d).toHaveProperty('unitEconomics');
    expect(d.year1).toHaveProperty('revenue');
    expect(d.year1).toHaveProperty('cogs');
  });

  it('validate() returns invalid when data is empty', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exports numeric thresholds', () => {
    expect(typeof ROI_PASS_THRESHOLD).toBe('number');
    expect(typeof ROI_CONDITIONAL_THRESHOLD).toBe('number');
    expect(typeof MAX_BREAKEVEN_MONTHS).toBe('number');
    expect(typeof LTV_CAC_THRESHOLD).toBe('number');
    expect(typeof PAYBACK_THRESHOLD).toBe('number');
    expect(typeof CONDITIONAL_LTV_CAC_THRESHOLD).toBe('number');
    expect(typeof CONDITIONAL_PAYBACK_THRESHOLD).toBe('number');
  });

  it('exports evaluateKillGate as a function', () => {
    expect(typeof evaluateKillGate).toBe('function');
  });
});

// SD-LEO-INFRA-S5-KILL-GATE-DEMAND-FEASIBILITY-001: the demand/acquisition-feasibility
// dimension re-arms S5 after cost-grounding turned a near-zero-cost venture into a
// false-pass rubber-stamp (clone S5: roi3y 217, breakeven month 1 — passes every cost
// check). A full PASS must now ALSO survive a CAC sensitivity stress OR carry demand
// evidence; otherwise the cost-only pass is downgraded to demand review.
describe('stage-05 — Demand/acquisition-feasibility dimension', () => {
  // Strong cost metrics that pass every prior check (the near-zero-cost false-pass shape).
  const strongCost = { roi3y: 2.17, breakEvenMonth: 1, ltvCacRatio: 5, paybackMonths: 2 };

  it('exports the demand thresholds as numbers', () => {
    expect(typeof DEMAND_CAC_STRESS_MULTIPLIER).toBe('number');
    expect(typeof DEMAND_STRESSED_LTV_CAC_THRESHOLD).toBe('number');
  });

  it('downgrades a cost-only pass with no demand evidence and a weak CAC stress to conditional_pass', () => {
    const r = evaluateKillGate({
      ...strongCost,
      demandFeasibility: { hasEvidence: false, stressedLtvCacRatio: 1.67 },
    });
    expect(r.decision).toBe('conditional_pass');
    expect(r.blockProgression).toBe(true);
    expect(r.reasons.some((x) => x.type === 'demand_unvalidated')).toBe(true);
  });

  it('grants a full pass when the CAC sensitivity band survives the stress', () => {
    const r = evaluateKillGate({
      ...strongCost,
      demandFeasibility: { hasEvidence: false, stressedLtvCacRatio: DEMAND_STRESSED_LTV_CAC_THRESHOLD },
    });
    expect(r.decision).toBe('pass');
  });

  it('grants a full pass when demand evidence is present even if the stressed band is weak', () => {
    const r = evaluateKillGate({
      ...strongCost,
      demandFeasibility: { hasEvidence: true, stressedLtvCacRatio: 0.1 },
    });
    expect(r.decision).toBe('pass');
  });

  it('is backward-compatible: omitting demandFeasibility preserves the prior full pass', () => {
    const r = evaluateKillGate(strongCost);
    expect(r.decision).toBe('pass');
    expect(r.reasons).toEqual([]);
  });

  it('a genuine cost KILL still kills regardless of strong demand', () => {
    const r = evaluateKillGate({
      roi3y: 0.05,
      breakEvenMonth: 30,
      ltvCacRatio: 5,
      paybackMonths: 2,
      demandFeasibility: { hasEvidence: true, stressedLtvCacRatio: 9 },
    });
    expect(r.decision).toBe('kill');
  });

  it('reproduces the clone S5 false-pass scenario routing to demand review (cac fallback 100, ltv 500)', () => {
    // Producer computes stressedLtvCacRatio = ltv / (cac * multiplier) = 500 / (100*3) = 1.67 < 2.
    const stressed = 500 / (100 * DEMAND_CAC_STRESS_MULTIPLIER);
    const r = evaluateKillGate({
      ...strongCost,
      demandFeasibility: { hasEvidence: false, stressedLtvCacRatio: stressed },
    });
    expect(r.decision).toBe('conditional_pass');
    expect(r.reasons.some((x) => x.type === 'demand_unvalidated')).toBe(true);
  });
});
