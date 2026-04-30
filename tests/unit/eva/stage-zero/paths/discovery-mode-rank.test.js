/**
 * Unit tests for FR-1 rankCandidates v2 5-field weighted composite + score_attribution + legacy v1 branch.
 * Covers: TS-1 (default-weights ranking emits score_attribution >=3), TS-5 (legacy v1 branch), TS-7 (coverage).
 *
 * Part of SD-LEO-ENH-TREND-SCANNER-SCORING-001 Checkpoint 1 / US-001.
 */

import { describe, test, expect } from 'vitest';
import { rankCandidates, DEFAULT_RANK_WEIGHTS } from '../../../../../lib/eva/stage-zero/paths/discovery-mode.js';
import { TREND_SCANNER_PROMPT_VERSION } from '../../../../../lib/eva/stage-zero/paths/discovery-mode-versions.js';

const v2 = TREND_SCANNER_PROMPT_VERSION;

function v2Candidate(overrides = {}) {
  return {
    name: 'Acme',
    problem_statement: 'Customers struggle with X',
    solution: 'AI agent does X',
    target_market: 'B2B SaaS startups with 50-200 employees in fintech',
    revenue_model: 'subscription',
    automation_approach: 'fully autonomous',
    monthly_revenue_potential: '$10K-$50K/month',
    competition_level: 'low',
    automation_feasibility: 8,
    prompt_version: v2,
    ...overrides,
  };
}

const strategicCtx = { themes: ['fintech automation', 'B2B SaaS', 'subscription revenue'] };

describe('rankCandidates - default weights (FR-1)', () => {
  test('DEFAULT_RANK_WEIGHTS sums to 1.0', () => {
    const sum = Object.values(DEFAULT_RANK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  test('top candidate cites >=3 LLM-emitted fields in score_attribution (TS-1, AC-1)', () => {
    const candidates = [
      v2Candidate({ name: 'Alpha', automation_feasibility: 9, monthly_revenue_potential: '$20K-$50K/month', competition_level: 'low' }),
      v2Candidate({ name: 'Beta', automation_feasibility: 7, monthly_revenue_potential: '$5K-$10K/month', competition_level: 'medium' }),
      v2Candidate({ name: 'Gamma', automation_feasibility: 5, monthly_revenue_potential: '$1K/month', competition_level: 'high' }),
      v2Candidate({ name: 'Delta', automation_feasibility: 6, monthly_revenue_potential: '$3K/month', competition_level: 'medium' }),
      v2Candidate({ name: 'Epsilon', automation_feasibility: 8, monthly_revenue_potential: '$15K/month', competition_level: 'low' }),
    ];
    const ranked = rankCandidates(candidates, { strategicContext: strategicCtx });
    expect(ranked[0].score_attribution.length).toBeGreaterThanOrEqual(3);
    // Must include >=3 of the 5 documented inputs (FR-1 names them automation_feasibility,
    // monthly_revenue_potential, target_market_specificity, strategic_fit, competition_level).
    const known = ['automation_feasibility', 'monthly_revenue_potential', 'target_market_specificity', 'strategic_fit', 'competition_level'];
    const cited = ranked[0].score_attribution.filter(a => known.includes(a));
    expect(cited.length).toBeGreaterThanOrEqual(3);
  });

  test('emits composite_score in 0-100 range with score alias for backward compat', () => {
    const ranked = rankCandidates([v2Candidate()], { strategicContext: strategicCtx });
    expect(ranked[0].composite_score).toBeGreaterThanOrEqual(0);
    expect(ranked[0].composite_score).toBeLessThanOrEqual(100);
    expect(ranked[0].score).toBe(ranked[0].composite_score);
  });

  test('higher automation_feasibility + low competition outranks lower with high competition', () => {
    const ranked = rankCandidates(
      [
        v2Candidate({ name: 'Weak', automation_feasibility: 4, competition_level: 'high', monthly_revenue_potential: '$1K' }),
        v2Candidate({ name: 'Strong', automation_feasibility: 9, competition_level: 'low', monthly_revenue_potential: '$20K' }),
      ],
      { strategicContext: strategicCtx }
    );
    expect(ranked[0].name).toBe('Strong');
  });

  test('handles missing fields without throwing — defaults to neutral contributions', () => {
    const ranked = rankCandidates([v2Candidate({ monthly_revenue_potential: undefined, target_market: '', competition_level: undefined })], { strategicContext: strategicCtx });
    expect(ranked[0]).toBeDefined();
    expect(ranked[0].score_attribution.length).toBeGreaterThan(0);
  });
});

describe('rankCandidates - tie-break order', () => {
  test('genuine composite ties broken by name ASC (A before B with identical inputs)', () => {
    const cands = [
      v2Candidate({ name: 'B', automation_feasibility: 5, monthly_revenue_potential: '$5K' }),
      v2Candidate({ name: 'A', automation_feasibility: 5, monthly_revenue_potential: '$5K' }),
    ];
    const ranked = rankCandidates(cands);
    expect(ranked[0].name).toBe('A');
    expect(ranked[1].name).toBe('B');
  });

  test('parsed_revenue_high DESC fires when composite ties (constructed via custom weights)', () => {
    // Force a tie on composite by zeroing the feasibility weight: same competition + market + fit + revenue weights
    // means revenue is the only differentiator — but identical candidates with different revenue
    // produce different composites. To genuinely tie composites, we hand-pick log10 of revenues
    // such that revenue contributions match: $5K and $4999 → log10 produces near-identical * 0.25.
    // Easier: use custom weights with strategic_fit=1.0 and identical contexts.
    const w = {
      automation_feasibility: 0.0,
      monthly_revenue_potential: 0.0,
      target_market_specificity: 0.0,
      strategic_fit: 1.0,
      competition_level: 0.0,
    };
    // Without strategicContext, fit=50 (neutral) for both; composites will tie.
    // Tie-break should then look at parsed_revenue_high.
    const cands = [
      v2Candidate({ name: 'LowRev', monthly_revenue_potential: '$1K', automation_feasibility: 8 }),
      v2Candidate({ name: 'HighRev', monthly_revenue_potential: '$50K', automation_feasibility: 4 }),
    ];
    const ranked = rankCandidates(cands, { weights: w });
    expect(ranked[0].composite_score).toBe(ranked[1].composite_score); // confirm tie
    expect(ranked[0].name).toBe('HighRev');
  });

  test('automation_feasibility DESC fires when composite + revenue both tie', () => {
    const w = {
      automation_feasibility: 0.0,
      monthly_revenue_potential: 0.0,
      target_market_specificity: 0.0,
      strategic_fit: 1.0,
      competition_level: 0.0,
    };
    const cands = [
      v2Candidate({ name: 'LowFeas', automation_feasibility: 4, monthly_revenue_potential: '$5K' }),
      v2Candidate({ name: 'HighFeas', automation_feasibility: 9, monthly_revenue_potential: '$5K' }),
    ];
    const ranked = rankCandidates(cands, { weights: w });
    expect(ranked[0].composite_score).toBe(ranked[1].composite_score);
    expect(ranked[0].parsed_revenue_high).toBe(ranked[1].parsed_revenue_high);
    expect(ranked[0].name).toBe('HighFeas');
  });
});

describe('rankCandidates - legacy v1 branch (TR-4, AC-5, TS-5)', () => {
  test('candidate without prompt_version uses 2-field v1 formula', () => {
    const legacyCandidate = {
      name: 'Old',
      automation_feasibility: 8,
      competition_level: 'low',
      // no prompt_version → legacy branch
    };
    const ranked = rankCandidates([legacyCandidate]);
    expect(ranked[0].score_attribution).toContain('legacy_v1_formula');
    // v1 formula: feasibility*10 + competition_bonus(low=10) = 90
    expect(ranked[0].score).toBe(90);
    expect(ranked[0].composite_score).toBe(90);
  });

  test('mixed v1+v2: each candidate scored under its own formula, no silent re-scoring', () => {
    const mixed = [
      { name: 'Legacy', automation_feasibility: 9, competition_level: 'low' }, // v1 → 100
      v2Candidate({ name: 'Modern', automation_feasibility: 9, monthly_revenue_potential: '$50K', competition_level: 'low' }),
    ];
    const ranked = rankCandidates(mixed, { strategicContext: strategicCtx });
    const legacy = ranked.find(r => r.name === 'Legacy');
    const modern = ranked.find(r => r.name === 'Modern');
    expect(legacy.score_attribution).toContain('legacy_v1_formula');
    expect(modern.score_attribution).not.toContain('legacy_v1_formula');
    // Legacy keeps its v1 score; modern is computed under v2.
    expect(legacy.composite_score).toBe(100);
  });
});

describe('rankCandidates - custom weights validation', () => {
  test('throws when custom weights do not sum to 1.0', () => {
    expect(() => rankCandidates([v2Candidate()], { weights: { automation_feasibility: 0.5 } })).toThrow(/sum to 1\.0/);
  });

  test('accepts custom weights that sum to 1.0', () => {
    const w = {
      automation_feasibility: 0.5,
      monthly_revenue_potential: 0.2,
      target_market_specificity: 0.1,
      strategic_fit: 0.1,
      competition_level: 0.1,
    };
    expect(() => rankCandidates([v2Candidate()], { weights: w, strategicContext: strategicCtx })).not.toThrow();
  });
});
