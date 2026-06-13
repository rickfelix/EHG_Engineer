/**
 * SD-LEO-INFRA-INCOME-OBJECTIVE-FUNCTION-001 — replacement-net + income-contribution scoring.
 * Pins the CANONICAL net definition and the three first-class income factors so a future
 * formula drift (or a weight revert) is caught.
 */
import { describe, it, expect } from 'vitest';
import {
  replacementNet,
  revenueToEffort,
  escapeVelocityContribution,
  timeToFirstDollarScore,
  incomeContribution,
  enrichVentureWithIncome,
  INCOME_DIMENSION_KEY,
  DEFAULT_INCOME_WEIGHTS,
  ESCAPE_VELOCITY_TARGET_MONTHLY,
} from '../../scripts/glide-path/replacement-net.js';

describe('replacementNet — canonical net (revenue − biz_exp − PPO − retirement − SE_tax)', () => {
  it('computes the canonical formula', () => {
    expect(replacementNet({ revenue: 20000, business_expenses: 3000, ppo: 1200, retirement: 1000, se_tax: 2800 }))
      .toBe(20000 - 3000 - 1200 - 1000 - 2800); // 12000
  });
  it('treats missing/garbage fields as 0 (fail-safe, no throw)', () => {
    expect(replacementNet({ revenue: 5000 })).toBe(5000);
    expect(replacementNet({})).toBe(0);
    expect(replacementNet()).toBe(0);
    expect(replacementNet({ revenue: 'x', business_expenses: null })).toBe(0);
  });
  it('can be negative for a loss-making venture', () => {
    expect(replacementNet({ revenue: 1000, business_expenses: 4000 })).toBe(-3000);
  });
});

describe('revenueToEffort — replacement-net per person-week', () => {
  it('divides net by effort', () => {
    expect(revenueToEffort({ revenue: 12000, effort_person_weeks: 4 })).toBe(3000);
  });
  it('returns 0 when effort <= 0 (no infinite-ROI claim)', () => {
    expect(revenueToEffort({ revenue: 12000, effort_person_weeks: 0 })).toBe(0);
    expect(revenueToEffort({ revenue: 12000 })).toBe(0);
    expect(revenueToEffort({ revenue: 12000, effort_person_weeks: -2 })).toBe(0);
  });
});

describe('escapeVelocityContribution — fraction of $18k target, clamped [0,1]', () => {
  it('uses the $18k default target', () => {
    expect(ESCAPE_VELOCITY_TARGET_MONTHLY).toBe(18000);
    expect(escapeVelocityContribution({ revenue: 9000 })).toBeCloseTo(0.5, 5); // 9000/18000
  });
  it('clamps to 1.0 when net >= target, 0 when net <= 0', () => {
    expect(escapeVelocityContribution({ revenue: 25000 })).toBe(1);
    expect(escapeVelocityContribution({ revenue: 1000, business_expenses: 2000 })).toBe(0); // net<0
    expect(escapeVelocityContribution({})).toBe(0);
  });
  it('honors an overridden target', () => {
    expect(escapeVelocityContribution({ revenue: 5000 }, 10000)).toBeCloseTo(0.5, 5);
    expect(escapeVelocityContribution({ revenue: 5000 }, 0)).toBe(0); // bad target → 0
  });
});

describe('timeToFirstDollarScore — sooner is better (aggressive first-dollar)', () => {
  it('0 days → 1.0, decays as days increase', () => {
    expect(timeToFirstDollarScore({ days_to_first_dollar: 0 })).toBe(1);
    const d90 = timeToFirstDollarScore({ days_to_first_dollar: 90 });
    const d180 = timeToFirstDollarScore({ days_to_first_dollar: 180 });
    expect(d90).toBeLessThan(1);
    expect(d180).toBeLessThan(d90); // monotonic decay
    expect(d90).toBeGreaterThan(0);
  });
  it('negative/unknown days → 0, but EXPLICIT 0 → 1', () => {
    expect(timeToFirstDollarScore({ days_to_first_dollar: -1 })).toBe(0);
    expect(timeToFirstDollarScore({})).toBe(0);                       // MISSING = unknown → no credit
    expect(timeToFirstDollarScore({ days_to_first_dollar: null })).toBe(0);
    expect(timeToFirstDollarScore({ days_to_first_dollar: 0 })).toBe(1); // explicit 0 = already earning
  });
});

describe('incomeContribution — weighted blend, tunable, default time-to-first-dollar highest', () => {
  it('default weights bias time-to-first-dollar (roadmap aggressive first-dollar)', () => {
    expect(DEFAULT_INCOME_WEIGHTS.timeToFirstDollar).toBeGreaterThan(DEFAULT_INCOME_WEIGHTS.escapeVelocity);
    expect(DEFAULT_INCOME_WEIGHTS.escapeVelocity).toBeGreaterThan(DEFAULT_INCOME_WEIGHTS.revenueToEffort);
  });
  it('returns a 0..1 composite with transparent components', () => {
    const r = incomeContribution({ revenue: 18000, business_expenses: 0, effort_person_weeks: 2, days_to_first_dollar: 0 });
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.components).toHaveProperty('replacement_net', 18000);
    expect(r.components).toHaveProperty('time_to_first_dollar');
    expect(r.components).toHaveProperty('escape_velocity_contribution');
    expect(r.components).toHaveProperty('revenue_to_effort');
  });
  it('is TUNABLE — different weights change the score', () => {
    const f = { revenue: 18000, effort_person_weeks: 100, days_to_first_dollar: 365 }; // slow + low effort-eff
    const ttfdHeavy = incomeContribution(f, { weights: { timeToFirstDollar: 1, escapeVelocity: 0, revenueToEffort: 0 } });
    const evHeavy = incomeContribution(f, { weights: { timeToFirstDollar: 0, escapeVelocity: 1, revenueToEffort: 0 } });
    expect(ttfdHeavy.score).not.toBeCloseTo(evHeavy.score, 5); // weighting matters
  });
  it('fail-safe: empty venture → score 0, no throw', () => {
    const r = incomeContribution({});
    expect(r.score).toBe(0);
    expect(r.components.replacement_net).toBe(0);
  });

  // Adversarial-review fix: a loss-making venture must NOT score the 0.5 time-to-first-dollar floor.
  it('PROFITABILITY GATE: a loss-maker / break-even scores 0 and ranks below a profitable venture', () => {
    const lossMaker = incomeContribution({ revenue: 5000, business_expenses: 55000, effort_person_weeks: 1, days_to_first_dollar: 0 });
    const breakEven = incomeContribution({ revenue: 5000, business_expenses: 5000, effort_person_weeks: 1, days_to_first_dollar: 0 });
    const profitableSlow = incomeContribution({ revenue: 9000, business_expenses: 0, effort_person_weeks: 4, days_to_first_dollar: 365 });
    expect(lossMaker.score).toBe(0);              // was 0.5 before the gate (the bug)
    expect(breakEven.score).toBe(0);              // net=0 → no progress toward distance-to-quit
    expect(profitableSlow.score).toBeGreaterThan(0);
    expect(profitableSlow.score).toBeGreaterThan(lossMaker.score); // profit out-ranks a money-loser
    expect(lossMaker.components.viable).toBe(false);
    expect(profitableSlow.components.viable).toBe(true);
  });
});

describe('enrichVentureWithIncome — populates the policy dimension (data-driven scoreVenture)', () => {
  it('adds income_contribution (0..100) without mutating the input', () => {
    const v = { id: 'V1', revenue: 18000, business_expenses: 0, effort_person_weeks: 2, days_to_first_dollar: 0 };
    const out = enrichVentureWithIncome(v, {});
    expect(out[INCOME_DIMENSION_KEY]).toBeGreaterThan(0);
    expect(out[INCOME_DIMENSION_KEY]).toBeLessThanOrEqual(100);
    expect(out.income_components).toBeTruthy();
    expect(v).not.toHaveProperty(INCOME_DIMENSION_KEY); // input not mutated
    expect(out.id).toBe('V1'); // other fields preserved
  });

  it('reads TUNABLE weights from policy.metadata.income_weights', () => {
    const slow = { revenue: 18000, effort_person_weeks: 100, days_to_first_dollar: 365 };
    const ttfdHeavy = enrichVentureWithIncome(slow, { metadata: { income_weights: { timeToFirstDollar: 1, escapeVelocity: 0, revenueToEffort: 0 } } });
    const evHeavy = enrichVentureWithIncome(slow, { metadata: { income_weights: { timeToFirstDollar: 0, escapeVelocity: 1, revenueToEffort: 0 } } });
    expect(ttfdHeavy[INCOME_DIMENSION_KEY]).not.toBe(evHeavy[INCOME_DIMENSION_KEY]); // policy weights drive the score
  });

  it('fail-safe: empty/garbage venture → income_contribution 0', () => {
    expect(enrichVentureWithIncome({}, {})[INCOME_DIMENSION_KEY]).toBe(0);
    expect(enrichVentureWithIncome(undefined, undefined)[INCOME_DIMENSION_KEY]).toBe(0);
    expect(INCOME_DIMENSION_KEY).toBe('income_contribution');
  });
});
