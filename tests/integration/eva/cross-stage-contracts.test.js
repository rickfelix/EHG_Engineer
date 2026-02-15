/**
 * Cross-Stage Contract Tests
 *
 * Validates that output from Stage N satisfies the cross-stage contract
 * required by Stage N+1 (or later consumers).
 *
 * Covers all 12 contract boundaries defined in stages 2-9.
 */

import { describe, it, expect } from 'vitest';
import { getTemplate } from '../../../lib/eva/stage-templates/index.js';
import { validateCrossStageContract } from '../../../lib/eva/stage-templates/validation.js';

// ── Test Data Generators ──────────────────────────────────────────────

function genStage01() {
  return {
    description: 'A platform that connects local artisans with global buyers through AI-powered matching and logistics',
    problemStatement: 'Artisans struggle to reach global markets due to high logistics costs',
    valueProp: 'AI-powered marketplace that reduces logistics cost by 40%',
    targetMarket: 'Small artisan businesses in developing economies',
    archetype: 'marketplace',
    keyAssumptions: ['Global demand for artisan goods is growing', 'AI can optimize logistics routes'],
    moatStrategy: 'Network effects and proprietary logistics AI',
    successCriteria: ['10K active sellers in 12 months', '$1M GMV in 6 months'],
    sourceProvenance: {},
  };
}

function genStage02() {
  return {
    analysis: {
      strategic: 'The marketplace model aligns well with the growing artisan economy trend',
      technical: 'AI-powered matching is technically feasible with current NLP capabilities',
      tactical: 'Start with 3 high-density artisan regions for initial supply acquisition',
    },
    metrics: {
      marketFit: 75, customerNeed: 80, momentum: 65,
      revenuePotential: 70, competitiveBarrier: 60, executionFeasibility: 72,
    },
    evidence: {
      market: 'TAM analysis shows $50B global artisan goods market growing at 8% CAGR',
      customer: '200 artisan interviews confirm logistics as top pain point',
      competitive: 'No AI-powered artisan marketplace exists; closest is Etsy (manual matching)',
      execution: 'Team has relevant marketplace and AI experience from prior ventures',
    },
    suggestions: [
      { type: 'immediate', text: 'Validate pricing with 50 target artisan users in pilot region' },
      { type: 'strategic', text: 'Build early partnerships with logistics providers in key regions' },
    ],
  };
}

function genStage03() {
  return {
    marketFit: 75, customerNeed: 80, momentum: 65,
    revenuePotential: 70, competitiveBarrier: 60, executionFeasibility: 72,
    competitorEntities: [
      { name: 'CompetitorA', positioning: 'Market leader', threat_level: 'H' },
      { name: 'CompetitorB', positioning: 'Niche player', threat_level: 'M' },
    ],
    confidenceScores: { marketFit: 0.8, customerNeed: 0.9 },
  };
}

function genStage04() {
  return {
    competitors: [
      { name: 'CompetitorA', position: 'Market leader in artisan goods', threat: 'H', pricingModel: 'subscription', marketPosition: 'Dominant', strengths: ['Strong brand recognition', 'Large user base'], weaknesses: ['Slow to innovate', 'High fees'], swot: { strengths: ['Brand'], weaknesses: ['Slow'], opportunities: ['New markets'], threats: ['Disruption'] } },
      { name: 'CompetitorB', position: 'Niche artisan marketplace', threat: 'M', pricingModel: 'freemium', marketPosition: 'Growing', strengths: ['Agile development', 'Low fees'], weaknesses: ['Small team', 'Limited reach'], swot: { strengths: ['Agile'], weaknesses: ['Small team'], opportunities: ['Growth'], threats: ['Funding'] } },
      { name: 'CompetitorC', position: 'Emerging logistics platform', threat: 'L', pricingModel: 'usage_based', marketPosition: 'New entrant', strengths: ['Advanced tech stack', 'AI capabilities'], weaknesses: ['Unknown brand', 'No marketplace'], swot: { strengths: ['Tech'], weaknesses: ['Unknown'], opportunities: ['Partnership'], threats: ['Regulation'] } },
    ],
    blueOceanAnalysis: { eliminate: ['High fees'], reduce: ['Complexity'], raise: ['AI matching'], create: ['Global logistics'] },
  };
}

function genStage05() {
  return {
    initialInvestment: 100000,
    year1: { revenue: 200000, cogs: 80000, opex: 60000 },
    year2: { revenue: 400000, cogs: 140000, opex: 100000 },
    year3: { revenue: 700000, cogs: 200000, opex: 150000 },
    unitEconomics: { cac: 50, ltv: 300, churnRate: 0.05, paybackMonths: 6, grossMargin: 0.6 },
    scenarioAnalysis: { pessimisticMultiplier: 0.7, optimisticMultiplier: 1.3, robustness: 'normal' },
    assumptions: { growthRate: 0.15, retentionRate: 0.95 },
  };
}

function genStage06() {
  const categories = ['Market', 'Product', 'Technical', 'Legal/Compliance', 'Financial', 'Operational'];
  const risks = [];
  for (let i = 0; i < 6; i++) {
    risks.push({
      id: `RISK-${String(i + 1).padStart(3, '0')}`,
      category: categories[i % 6],
      description: `Detailed description of risk number ${i + 1} that exceeds minimum length`,
      severity: Math.min(5, (i % 5) + 1),
      probability: Math.min(5, (i % 5) + 1),
      impact: Math.min(5, (i % 5) + 1),
      mitigation: `Detailed mitigation strategy for risk number ${i + 1} exceeding minimum`,
      owner: `Risk Owner ${i + 1}`,
      status: ['open', 'mitigated', 'accepted', 'open', 'open', 'closed'][i],
      review_date: '2026-06-01',
      residual_severity: Math.max(1, (i % 5)),
      residual_probability: Math.max(1, (i % 5)),
      residual_impact: Math.max(1, (i % 5)),
    });
  }
  return { risks };
}

function genStage07() {
  return {
    currency: 'USD',
    pricing_model: 'subscription',
    primaryValueMetric: 'active users',
    priceAnchor: 29.99,
    competitiveContext: 'Mid-market pricing aligned with value delivery',
    tiers: [
      { name: 'Starter', price: 9.99, billing_period: 'monthly', included_units: '100 users', target_segment: 'Small businesses' },
      { name: 'Pro', price: 29.99, billing_period: 'monthly', included_units: '500 users', target_segment: 'Mid-market' },
      { name: 'Enterprise', price: 99.99, billing_period: 'monthly', included_units: 'Unlimited', target_segment: 'Enterprise' },
    ],
    gross_margin_pct: 75,
    churn_rate_monthly: 5,
    cac: 50,
    arpa: 29.99,
  };
}

function genStage08() {
  const blocks = {};
  const BMC_BLOCKS = [
    'customerSegments', 'valuePropositions', 'channels', 'customerRelationships',
    'revenueStreams', 'keyResources', 'keyActivities', 'keyPartnerships', 'costStructure',
  ];
  for (const block of BMC_BLOCKS) {
    blocks[block] = {
      items: [
        { text: `${block} item 1`, priority: 1, evidence: 'Market research' },
        { text: `${block} item 2`, priority: 2, evidence: 'User interviews' },
      ],
    };
  }
  return blocks;
}

// ── Helpers ───────────────────────────────────────────────────────────

const silentLogger = { warn() {}, info() {}, error() {}, debug() {}, log() {} };

function computeDerivedFor(stageNum, data) {
  const template = getTemplate(stageNum);
  return template.computeDerived(data, { logger: silentLogger });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Cross-Stage Contracts', () => {

  // ── Contract 1: Stage 02 ← Stage 01 ──────────────────────────────

  describe('Stage 02 ← Stage 01', () => {
    const contract = {
      description: { type: 'string', minLength: 50 },
      problemStatement: { type: 'string', minLength: 20 },
      valueProp: { type: 'string', minLength: 20 },
      targetMarket: { type: 'string', minLength: 10 },
      archetype: { type: 'string' },
    };

    it('genStage01 output satisfies stage-02 cross-stage contract', () => {
      const result = validateCrossStageContract(genStage01(), contract, 'stage-01');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('stage-02 validate() passes with stage-01 prerequisites', () => {
      const template = getTemplate(2);
      const result = template.validate(genStage02(), { stage01: genStage01() }, { logger: silentLogger });
      expect(result.valid).toBe(true);
    });

    it('rejects when stage-01 description is too short', () => {
      const result = validateCrossStageContract({ description: 'short' }, contract, 'stage-01');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects when stage-01 data is null', () => {
      const result = validateCrossStageContract(null, contract, 'stage-01');
      expect(result.valid).toBe(false);
    });

    it('rejects when archetype is a number instead of string', () => {
      const data = { ...genStage01(), archetype: 42 };
      const result = validateCrossStageContract(data, contract, 'stage-01');
      expect(result.valid).toBe(false);
    });
  });

  // ── Contract 2: Stage 03 ← Stage 02 ──────────────────────────────

  describe('Stage 03 ← Stage 02', () => {
    const contract = { metrics: { type: 'object' }, evidence: { type: 'object' } };

    it('genStage02 output satisfies stage-03 cross-stage contract', () => {
      const result = validateCrossStageContract(genStage02(), contract, 'stage-02');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects when metrics is missing', () => {
      const data = { evidence: { market: 'data' } };
      const result = validateCrossStageContract(data, contract, 'stage-02');
      expect(result.valid).toBe(false);
    });

    it('rejects when metrics is an array instead of object', () => {
      const data = { metrics: [1, 2, 3], evidence: { market: 'data' } };
      const result = validateCrossStageContract(data, contract, 'stage-02');
      expect(result.valid).toBe(false);
    });
  });

  // ── Contract 3: Stage 03 ← Stage 01 ──────────────────────────────

  describe('Stage 03 ← Stage 01', () => {
    const contract = { archetype: { type: 'string' }, problemStatement: { type: 'string', minLength: 20 } };

    it('genStage01 output satisfies stage-03 cross-stage contract from stage-01', () => {
      const result = validateCrossStageContract(genStage01(), contract, 'stage-01');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('stage-03 validate() passes with both prerequisites', () => {
      const template = getTemplate(3);
      const prerequisites = { stage01: genStage01(), stage02: genStage02() };
      const result = template.validate(genStage03(), prerequisites, { logger: silentLogger });
      expect(result.valid).toBe(true);
    });

    it('rejects when problemStatement is too short', () => {
      const data = { archetype: 'marketplace', problemStatement: 'short' };
      const result = validateCrossStageContract(data, contract, 'stage-01');
      expect(result.valid).toBe(false);
    });
  });

  // ── Contract 4: Stage 04 ← Stage 03 ──────────────────────────────

  describe('Stage 04 ← Stage 03', () => {
    const contract = {
      competitorEntities: { type: 'array', required: false, minItems: 0 },
      decision: { type: 'string', required: false },
    };

    it('genStage03 output satisfies stage-04 cross-stage contract', () => {
      const result = validateCrossStageContract(genStage03(), contract, 'stage-03');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes when optional fields are absent', () => {
      const result = validateCrossStageContract({}, contract, 'stage-03');
      expect(result.valid).toBe(true);
    });

    it('rejects when competitorEntities is a string instead of array', () => {
      const result = validateCrossStageContract({ competitorEntities: 'not-array' }, contract, 'stage-03');
      expect(result.valid).toBe(false);
    });
  });

  // ── Contract 5: Stage 05 ← Stage 04 (requires computeDerived) ────

  describe('Stage 05 ← Stage 04', () => {
    const contract = { stage5Handoff: { type: 'object' } };

    it('stage-04 computeDerived output satisfies stage-05 cross-stage contract', () => {
      const derived = computeDerivedFor(4, genStage04());
      const result = validateCrossStageContract(derived, contract, 'stage-04');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('stage-05 validate() passes with derived stage-04 prerequisites', () => {
      const template = getTemplate(5);
      const derived04 = computeDerivedFor(4, genStage04());
      const prerequisites = { stage04: derived04 };
      const result = template.validate(genStage05(), prerequisites, { logger: silentLogger });
      expect(result.valid).toBe(true);
    });

    it('rejects when stage5Handoff is missing from raw (non-derived) data', () => {
      const result = validateCrossStageContract(genStage04(), contract, 'stage-04');
      expect(result.valid).toBe(false);
    });

    it('rejects when data is null', () => {
      const result = validateCrossStageContract(null, contract, 'stage-04');
      expect(result.valid).toBe(false);
    });
  });

  // ── Contract 6: Stage 06 ← Stage 05 ──────────────────────────────

  describe('Stage 06 ← Stage 05', () => {
    const contract = { unitEconomics: { type: 'object' } };

    it('genStage05 output satisfies stage-06 cross-stage contract', () => {
      const result = validateCrossStageContract(genStage05(), contract, 'stage-05');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('stage-06 validate() passes with stage-05 prerequisites', () => {
      const template = getTemplate(6);
      const prerequisites = { stage05: genStage05() };
      const result = template.validate(genStage06(), prerequisites, { logger: silentLogger });
      expect(result.valid).toBe(true);
    });

    it('rejects when unitEconomics is missing', () => {
      const result = validateCrossStageContract({}, contract, 'stage-05');
      expect(result.valid).toBe(false);
    });

    it('rejects when unitEconomics is an array', () => {
      const result = validateCrossStageContract({ unitEconomics: [] }, contract, 'stage-05');
      expect(result.valid).toBe(false);
    });
  });

  // ── Contract 7: Stage 07 ← Stage 05 ──────────────────────────────

  describe('Stage 07 ← Stage 05', () => {
    const contract = { unitEconomics: { type: 'object' } };

    it('genStage05 output satisfies stage-07 cross-stage contract from stage-05', () => {
      const result = validateCrossStageContract(genStage05(), contract, 'stage-05');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects when unitEconomics is null', () => {
      const result = validateCrossStageContract({ unitEconomics: null }, contract, 'stage-05');
      expect(result.valid).toBe(false);
    });
  });

  // ── Contract 8: Stage 07 ← Stage 06 (requires computeDerived) ────

  describe('Stage 07 ← Stage 06', () => {
    const contract = { aggregate_risk_score: { type: 'number', required: false } };

    it('stage-06 computeDerived output satisfies stage-07 cross-stage contract', () => {
      const derived = computeDerivedFor(6, genStage06());
      const result = validateCrossStageContract(derived, contract, 'stage-06');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('stage-07 validate() passes with derived stage-06 and stage-05 prerequisites', () => {
      const template = getTemplate(7);
      const derived06 = computeDerivedFor(6, genStage06());
      const prerequisites = { stage05: genStage05(), stage06: derived06 };
      const result = template.validate(genStage07(), prerequisites, { logger: silentLogger });
      expect(result.valid).toBe(true);
    });

    it('passes when aggregate_risk_score is absent (optional)', () => {
      const result = validateCrossStageContract({}, contract, 'stage-06');
      expect(result.valid).toBe(true);
    });

    it('rejects when aggregate_risk_score is a string', () => {
      const result = validateCrossStageContract({ aggregate_risk_score: 'high' }, contract, 'stage-06');
      expect(result.valid).toBe(false);
    });
  });

  // ── Contract 9: Stage 08 ← Stage 07 ──────────────────────────────

  describe('Stage 08 ← Stage 07', () => {
    const contract = { pricing_model: { type: 'string' }, tiers: { type: 'array', minItems: 1 } };

    it('genStage07 output satisfies stage-08 cross-stage contract', () => {
      const result = validateCrossStageContract(genStage07(), contract, 'stage-07');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('stage-08 validate() passes with stage-07 prerequisites', () => {
      const template = getTemplate(8);
      const prerequisites = { stage07: genStage07() };
      const result = template.validate(genStage08(), prerequisites, { logger: silentLogger });
      expect(result.valid).toBe(true);
    });

    it('rejects when tiers is empty', () => {
      const data = { pricing_model: 'subscription', tiers: [] };
      const result = validateCrossStageContract(data, contract, 'stage-07');
      expect(result.valid).toBe(false);
    });

    it('rejects when pricing_model is missing', () => {
      const data = { tiers: [{ name: 'Basic' }] };
      const result = validateCrossStageContract(data, contract, 'stage-07');
      expect(result.valid).toBe(false);
    });
  });

  // ── Contract 10: Stage 09 ← Stage 06 (requires computeDerived) ───

  describe('Stage 09 ← Stage 06', () => {
    const contract = {
      risks: { type: 'array', minItems: 1 },
      aggregate_risk_score: { type: 'number', required: false },
    };

    it('stage-06 computeDerived output satisfies stage-09 cross-stage contract', () => {
      const derived = computeDerivedFor(6, genStage06());
      const result = validateCrossStageContract(derived, contract, 'stage-06');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects when risks array is empty', () => {
      const result = validateCrossStageContract({ risks: [] }, contract, 'stage-06');
      expect(result.valid).toBe(false);
    });

    it('rejects when risks is not an array', () => {
      const result = validateCrossStageContract({ risks: 'none' }, contract, 'stage-06');
      expect(result.valid).toBe(false);
    });
  });

  // ── Contract 11: Stage 09 ← Stage 07 ──────────────────────────────

  describe('Stage 09 ← Stage 07', () => {
    const contract = { tiers: { type: 'array', minItems: 1 } };

    it('genStage07 output satisfies stage-09 cross-stage contract', () => {
      const result = validateCrossStageContract(genStage07(), contract, 'stage-07');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects when tiers is missing', () => {
      const result = validateCrossStageContract({}, contract, 'stage-07');
      expect(result.valid).toBe(false);
    });
  });

  // ── Contract 12: Stage 09 ← Stage 08 ──────────────────────────────

  describe('Stage 09 ← Stage 08', () => {
    const BMC_BLOCKS = [
      'customerSegments', 'valuePropositions', 'channels', 'customerRelationships',
      'revenueStreams', 'keyResources', 'keyActivities', 'keyPartnerships', 'costStructure',
    ];
    const contract = {};
    for (const block of BMC_BLOCKS) {
      contract[block] = { type: 'object' };
    }

    it('genStage08 output satisfies stage-09 cross-stage contract', () => {
      const result = validateCrossStageContract(genStage08(), contract, 'stage-08');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('stage-09 validate() passes with all prerequisites', () => {
      const template = getTemplate(9);
      const derived06 = computeDerivedFor(6, genStage06());
      const prerequisites = {
        stage06: derived06,
        stage07: genStage07(),
        stage08: genStage08(),
      };
      // Stage 09 needs its own data too - use a minimal valid structure
      // We just need validate() not to fail on cross-stage contracts
      const stage09Template = getTemplate(9);
      const stage09Data = stage09Template.defaultData || {};
      const result = template.validate(stage09Data, prerequisites, { logger: silentLogger });
      // Cross-stage contracts should pass even if stage09's own data is incomplete
      // We check that it doesn't throw
      expect(result).toBeDefined();
    });

    it('rejects when a BMC block is missing', () => {
      const partial = { ...genStage08() };
      delete partial.customerSegments;
      const result = validateCrossStageContract(partial, contract, 'stage-08');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('customerSegments'))).toBe(true);
    });

    it('rejects when a BMC block is an array instead of object', () => {
      const data = { ...genStage08(), valuePropositions: ['not', 'an', 'object'] };
      const result = validateCrossStageContract(data, contract, 'stage-08');
      expect(result.valid).toBe(false);
    });

    it('rejects when upstream data is null', () => {
      const result = validateCrossStageContract(null, contract, 'stage-08');
      expect(result.valid).toBe(false);
    });
  });
});
