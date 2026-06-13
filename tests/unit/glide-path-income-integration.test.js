/**
 * SD-LEO-INFRA-INCOME-OBJECTIVE-FUNCTION-001 — scoreVenture income choke-point integration.
 * Verifies the data-driven Glide Path scorer auto-enriches a venture with income_contribution
 * ONLY when the policy declares that dimension, weights it as a first-class factor, and leaves
 * legacy policies (no income dimension) byte-for-byte unchanged.
 */
import { describe, it, expect } from 'vitest';
import { scoreVenture } from '../../scripts/glide-path/policy-engine.js';
import { withIncomeDimension, INCOME_DIMENSION_DEF, DEFAULT_INCOME_DIMENSION_WEIGHT } from '../../scripts/glide-path/add-income-dimension.mjs';

const phaseDefs = [{ phase: 'phase_a', min_score: 0, max_score: 100, allowed_growth_strategies: ['cash_engine'] }];

const policyWithIncome = {
  policy_version: 99,
  dimensions: [
    { key: 'revenue_potential', source_field: 'revenue_potential', default_value: 50, min: 0, max: 100 },
    { key: 'income_contribution', source_field: 'income_contribution', default_value: 0, min: 0, max: 100 },
  ],
  weights: { revenue_potential: 0.25, income_contribution: 0.18 },
  phase_definitions: phaseDefs,
  metadata: {},
};

const legacyPolicy = {
  policy_version: 1,
  dimensions: [{ key: 'revenue_potential', source_field: 'revenue_potential', default_value: 50, min: 0, max: 100 }],
  weights: { revenue_potential: 1 },
  phase_definitions: phaseDefs,
};

describe('scoreVenture — income choke-point auto-enrich', () => {
  it('auto-enriches & includes income_contribution in dimension_scores when the policy declares it', () => {
    const v = { id: 'V', revenue_potential: 50, revenue: 18000, business_expenses: 0, effort_person_weeks: 1, days_to_first_dollar: 0 };
    const r = scoreVenture(v, policyWithIncome);
    expect(r.dimension_scores).toHaveProperty('income_contribution');
    expect(r.dimension_scores.income_contribution).toBeGreaterThan(0);
  });

  it('an income-strong venture out-scores an income-absent one on the income dimension (unknown → 0)', () => {
    const strong = scoreVenture({ id: 'A', revenue_potential: 50, revenue: 18000, effort_person_weeks: 1, days_to_first_dollar: 0 }, policyWithIncome);
    const none = scoreVenture({ id: 'B', revenue_potential: 50 }, policyWithIncome); // no income fields
    expect(strong.dimension_scores.income_contribution).toBeGreaterThan(none.dimension_scores.income_contribution);
    expect(none.dimension_scores.income_contribution).toBe(0); // fail-safe: unknown earns no credit
  });

  it('legacy policy WITHOUT the income dimension is unchanged (no enrichment side-effect)', () => {
    const r = scoreVenture({ id: 'C', revenue_potential: 80 }, legacyPolicy);
    expect(r.dimension_scores).not.toHaveProperty('income_contribution');
    expect(r.composite_score).toBe(80); // single dim weight 1 → normalized 0.8 → 80
  });

  it('respects a pre-enriched income_contribution (idempotent — no double-enrich)', () => {
    const r = scoreVenture({ id: 'D', revenue_potential: 50, income_contribution: 90 }, policyWithIncome);
    expect(r.dimension_scores.income_contribution).toBeCloseTo(0.9, 5); // normalized 90/100, not recomputed
  });

  it('does not throw on null venture', () => {
    expect(() => scoreVenture(null, policyWithIncome)).not.toThrow();
  });
});

describe('withIncomeDimension — additive, idempotent policy upgrade', () => {
  const basePolicy = {
    dimensions: [{ key: 'revenue_potential', source_field: 'revenue_potential', default_value: 50, min: 0, max: 100 }],
    weights: { revenue_potential: 1.0 },
    metadata: {},
  };

  it('adds the income dimension + weight WITHOUT touching existing weights', () => {
    const next = withIncomeDimension(basePolicy);
    expect(next.changed).toBe(true);
    expect(next.dimensions.some((d) => d.key === 'income_contribution')).toBe(true);
    expect(next.weights.revenue_potential).toBe(1.0); // existing weight untouched (SDNextSelector safe)
    expect(next.weights.income_contribution).toBe(DEFAULT_INCOME_DIMENSION_WEIGHT);
    expect(next.metadata.income_weights).toBeTruthy(); // tunable weights stored as config
  });

  it('is idempotent — re-applying is a no-op', () => {
    const once = withIncomeDimension(basePolicy);
    const twice = withIncomeDimension({ dimensions: once.dimensions, weights: once.weights, metadata: once.metadata });
    expect(twice.changed).toBe(false);
    expect(twice.weights.income_contribution).toBe(DEFAULT_INCOME_DIMENSION_WEIGHT); // not doubled
    expect(twice.dimensions.filter((d) => d.key === 'income_contribution')).toHaveLength(1); // not duplicated
  });

  it('the income dimension default_value is 0 (unknown income earns no credit)', () => {
    expect(INCOME_DIMENSION_DEF.default_value).toBe(0);
    expect(INCOME_DIMENSION_DEF.min).toBe(0);
    expect(INCOME_DIMENSION_DEF.max).toBe(100);
  });
});

// Adversarial-review fix (minor): validateWeights must treat income_contribution as an additive
// overlay so the post-deploy policy (base sum 1.0 + 0.18 overlay = 1.18) does not break a future
// re-tune/clone that re-validates the weights.
describe('validateWeights — income_contribution additive overlay', () => {
  it('accepts a policy upgraded by withIncomeDimension (base 1.0 + income overlay)', async () => {
    const { validateWeights } = await import('../../scripts/glide-path/policy-writer.js');
    const next = withIncomeDimension({ dimensions: [{ key: 'revenue_potential' }], weights: { revenue_potential: 1.0 }, metadata: {} });
    expect(() => validateWeights(next.weights, next.dimensions)).not.toThrow();
  });

  it('still REJECTS base weights that do not sum to 1.0 (overlay does not mask a bad base)', async () => {
    const { validateWeights } = await import('../../scripts/glide-path/policy-writer.js');
    const dims = [{ key: 'revenue_potential' }, { key: 'income_contribution' }];
    expect(() => validateWeights({ revenue_potential: 0.5, income_contribution: 0.18 }, dims)).toThrow(/Base weights sum/);
  });
});
