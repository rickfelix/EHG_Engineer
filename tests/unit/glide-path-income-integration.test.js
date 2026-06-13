/**
 * SD-LEO-INFRA-INCOME-OBJECTIVE-FUNCTION-001 — scoreVenture income choke-point integration.
 * Verifies the data-driven Glide Path scorer auto-enriches a venture with income_contribution
 * ONLY when the policy declares that dimension, weights it as a first-class factor, and leaves
 * legacy policies (no income dimension) byte-for-byte unchanged.
 */
import { describe, it, expect } from 'vitest';
import { scoreVenture } from '../../scripts/glide-path/policy-engine.js';

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
