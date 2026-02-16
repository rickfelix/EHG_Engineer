/**
 * Unit tests for Tournament Scorer - Multi-Dimension Rubric Engine
 * SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-E (FR-2)
 *
 * Test Scenarios:
 * - TS-1: scoreGeneration returns object with total and 4 dimension scores
 * - TS-2: Each dimension score is clamped to [0, 25]
 * - TS-3: Specificity scoring (TBD penalties, concrete detail rewards)
 * - TS-4: Actionability scoring (budgets, KPIs, channel type diversity)
 * - TS-5: Market-fit scoring (persona, pain points, context alignment)
 * - TS-6: Financial-coherence scoring (TAM>SAM>SOM hierarchy, CAC realism)
 * - TS-7: Edge cases (empty/null input)
 *
 * @module tests/unit/eva/crews/tournament-scorer.test
 */

import { describe, it, expect } from 'vitest';
import { scoreGeneration, MAX_DIMENSION_SCORE } from '../../../../lib/eva/crews/tournament-scorer.js';

/**
 * Helper: create a well-formed GTM result for scoring.
 */
function createValidGTMResult(overrides = {}) {
  return {
    tiers: [
      {
        name: 'SMB SaaS',
        description: 'Small SaaS companies needing GTM automation',
        tam: 5000000,
        sam: 1000000,
        som: 100000,
        persona: 'CTO at 10-50 person SaaS startup',
        painPoints: ['Manual GTM planning', 'No market data'],
      },
      {
        name: 'Mid-Market',
        description: 'Growing SaaS companies scaling their go-to-market',
        tam: 20000000,
        sam: 5000000,
        som: 500000,
        persona: 'VP Marketing at 50-200 person company',
        painPoints: ['CAC tracking', 'Channel optimization'],
      },
      {
        name: 'Enterprise',
        description: 'Large organizations with complex GTM needs',
        tam: 50000000,
        sam: 10000000,
        som: 1000000,
        persona: 'CMO at Fortune 500 with multi-channel attribution needs',
        painPoints: ['Multi-channel attribution', 'Budget allocation'],
      },
    ],
    channels: [
      { name: 'LinkedIn Ads', monthly_budget: 5000, expected_cac: 120, primary_kpi: 'Demo requests per month', channelType: 'paid', primaryTier: 'SMB SaaS' },
      { name: 'SEO Blog', monthly_budget: 2000, expected_cac: 30, primary_kpi: 'Organic signups per month', channelType: 'organic', primaryTier: 'SMB SaaS' },
      { name: 'Product Hunt Launch', monthly_budget: 500, expected_cac: 15, primary_kpi: 'Launch day signups', channelType: 'earned', primaryTier: 'SMB SaaS' },
      { name: 'Email Newsletter', monthly_budget: 300, expected_cac: 8, primary_kpi: 'Conversion rate', channelType: 'owned', primaryTier: 'Mid-Market' },
      { name: 'Google Ads', monthly_budget: 3000, expected_cac: 80, primary_kpi: 'Trial signups', channelType: 'paid', primaryTier: 'Mid-Market' },
      { name: 'Partner Integrations', monthly_budget: 1000, expected_cac: 50, primary_kpi: 'Integration installs', channelType: 'earned', primaryTier: 'Mid-Market' },
      { name: 'Conference Talks', monthly_budget: 2000, expected_cac: 200, primary_kpi: 'Leads per event', channelType: 'owned', primaryTier: 'Enterprise' },
      { name: 'Outbound Sales', monthly_budget: 0, expected_cac: 0, primary_kpi: 'TBD', channelType: 'owned', primaryTier: 'Enterprise' },
    ],
    launch_timeline: [
      { milestone: 'Beta launch', date: '2026-03-01', owner: 'Product' },
      { milestone: 'Public launch', date: '2026-04-15', owner: 'Marketing' },
      { milestone: 'Growth phase', date: '2026-07-01', owner: 'Growth' },
    ],
    ...overrides,
  };
}

describe('tournament-scorer.js - Multi-Dimension Rubric Engine', () => {
  describe('Exported constants', () => {
    it('should export MAX_DIMENSION_SCORE as 25', () => {
      expect(MAX_DIMENSION_SCORE).toBe(25);
    });
  });

  describe('scoreGeneration() return shape (TS-1)', () => {
    it('should return an object with total and 4 dimension scores', () => {
      const result = scoreGeneration(createValidGTMResult());
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('specificity');
      expect(result).toHaveProperty('actionability');
      expect(result).toHaveProperty('marketFit');
      expect(result).toHaveProperty('financialCoherence');
    });

    it('should have total equal to the sum of all 4 dimensions', () => {
      const result = scoreGeneration(createValidGTMResult());
      expect(result.total).toBe(
        result.specificity + result.actionability + result.marketFit + result.financialCoherence
      );
    });

    it('should return numeric values for all fields', () => {
      const result = scoreGeneration(createValidGTMResult());
      expect(typeof result.total).toBe('number');
      expect(typeof result.specificity).toBe('number');
      expect(typeof result.actionability).toBe('number');
      expect(typeof result.marketFit).toBe('number');
      expect(typeof result.financialCoherence).toBe('number');
    });
  });

  describe('Score clamping (TS-2)', () => {
    it('should clamp each dimension score to [0, 25]', () => {
      const result = scoreGeneration(createValidGTMResult());
      expect(result.specificity).toBeGreaterThanOrEqual(0);
      expect(result.specificity).toBeLessThanOrEqual(25);
      expect(result.actionability).toBeGreaterThanOrEqual(0);
      expect(result.actionability).toBeLessThanOrEqual(25);
      expect(result.marketFit).toBeGreaterThanOrEqual(0);
      expect(result.marketFit).toBeLessThanOrEqual(25);
      expect(result.financialCoherence).toBeGreaterThanOrEqual(0);
      expect(result.financialCoherence).toBeLessThanOrEqual(25);
    });

    it('should have total in range [0, 100]', () => {
      const result = scoreGeneration(createValidGTMResult());
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
    });
  });

  describe('Specificity scoring (TS-3)', () => {
    it('should score higher for specific tier names vs generic "Tier N" names', () => {
      const specific = scoreGeneration(createValidGTMResult());

      const generic = scoreGeneration(createValidGTMResult({
        tiers: [
          { name: 'Tier 1', description: 'TBD', tam: 1000, sam: 100, som: 10 },
          { name: 'Tier 2', description: 'TBD', tam: 500, sam: 50, som: 5 },
          { name: 'Tier 3', description: 'TBD', tam: 200, sam: 20, som: 2 },
        ],
      }));

      expect(specific.specificity).toBeGreaterThan(generic.specificity);
    });

    it('should penalize TBD descriptions (score lower than concrete descriptions)', () => {
      const concrete = scoreGeneration(createValidGTMResult());

      const tbdTiers = createValidGTMResult().tiers.map(t => ({
        ...t,
        description: 'TBD',
      }));
      const tbd = scoreGeneration(createValidGTMResult({ tiers: tbdTiers }));

      expect(concrete.specificity).toBeGreaterThan(tbd.specificity);
    });

    it('should penalize TBD KPIs in channels', () => {
      const concrete = scoreGeneration(createValidGTMResult());

      const tbdChannels = createValidGTMResult().channels.map(ch => ({
        ...ch,
        primary_kpi: 'TBD',
      }));
      const tbd = scoreGeneration(createValidGTMResult({ channels: tbdChannels }));

      expect(concrete.specificity).toBeGreaterThan(tbd.specificity);
    });

    it('should reward specific (non-default) channel names', () => {
      const specific = scoreGeneration(createValidGTMResult());

      // Use only default channel names
      const defaultChannels = createValidGTMResult().channels.map((ch, i) => ({
        ...ch,
        name: ['Organic Search', 'Paid Search', 'Social Media', 'Content Marketing',
          'Email Marketing', 'Partnerships', 'Events', 'Direct Sales'][i],
      }));
      const defaultResult = scoreGeneration(createValidGTMResult({ channels: defaultChannels }));

      expect(specific.specificity).toBeGreaterThan(defaultResult.specificity);
    });

    it('should reward launch timeline entries with valid YYYY-MM-DD dates', () => {
      const withDates = scoreGeneration(createValidGTMResult());

      const noDates = scoreGeneration(createValidGTMResult({
        launch_timeline: [
          { milestone: 'Beta launch', date: '', owner: 'Product' },
          { milestone: 'Public launch', date: 'Q2 2026', owner: 'Marketing' },
          { milestone: 'Growth phase', date: 'later', owner: 'Growth' },
        ],
      }));

      expect(withDates.specificity).toBeGreaterThan(noDates.specificity);
    });

    it('should reward tiers with persona and painPoints', () => {
      const withPersona = scoreGeneration(createValidGTMResult());

      const noPersonaTiers = createValidGTMResult().tiers.map(t => ({
        ...t,
        persona: '',
        painPoints: [],
      }));
      const withoutPersona = scoreGeneration(createValidGTMResult({ tiers: noPersonaTiers }));

      expect(withPersona.specificity).toBeGreaterThan(withoutPersona.specificity);
    });
  });

  describe('Actionability scoring (TS-4)', () => {
    it('should reward non-zero budgets (more active channels = higher score)', () => {
      const manyActive = scoreGeneration(createValidGTMResult());

      // All channels with zero budget
      const zeroChannels = createValidGTMResult().channels.map(ch => ({
        ...ch,
        monthly_budget: 0,
      }));
      const noneActive = scoreGeneration(createValidGTMResult({ channels: zeroChannels }));

      expect(manyActive.actionability).toBeGreaterThan(noneActive.actionability);
    });

    it('should reward diverse channel types', () => {
      const diverse = scoreGeneration(createValidGTMResult());

      // All same channel type
      const sameType = createValidGTMResult().channels.map(ch => ({
        ...ch,
        channelType: 'paid',
      }));
      const monotone = scoreGeneration(createValidGTMResult({ channels: sameType }));

      expect(diverse.actionability).toBeGreaterThan(monotone.actionability);
    });

    it('should reward channels with non-TBD KPIs longer than 5 chars', () => {
      const goodKPIs = scoreGeneration(createValidGTMResult());

      const shortKPIs = createValidGTMResult().channels.map(ch => ({
        ...ch,
        primary_kpi: 'KPI',  // only 3 chars
      }));
      const bad = scoreGeneration(createValidGTMResult({ channels: shortKPIs }));

      expect(goodKPIs.actionability).toBeGreaterThan(bad.actionability);
    });

    it('should reward channels referencing multiple tiers', () => {
      const multiTier = scoreGeneration(createValidGTMResult());

      // All channels reference same tier
      const sameTier = createValidGTMResult().channels.map(ch => ({
        ...ch,
        primaryTier: 'SMB SaaS',
      }));
      const singleTier = scoreGeneration(createValidGTMResult({ channels: sameTier }));

      expect(multiTier.actionability).toBeGreaterThan(singleTier.actionability);
    });
  });

  describe('Market-fit scoring (TS-5)', () => {
    it('should reward personas longer than 20 characters', () => {
      const longPersona = scoreGeneration(createValidGTMResult());

      const shortPersona = createValidGTMResult().tiers.map(t => ({
        ...t,
        persona: 'CTO', // short
      }));
      const shortResult = scoreGeneration(createValidGTMResult({ tiers: shortPersona }));

      expect(longPersona.marketFit).toBeGreaterThan(shortResult.marketFit);
    });

    it('should reward tiers with 2+ pain points', () => {
      const manyPains = scoreGeneration(createValidGTMResult());

      const fewPains = createValidGTMResult().tiers.map(t => ({
        ...t,
        painPoints: ['Just one'],
      }));
      const fewResult = scoreGeneration(createValidGTMResult({ tiers: fewPains }));

      expect(manyPains.marketFit).toBeGreaterThan(fewResult.marketFit);
    });

    it('should reward tiers with positive TAM/SAM/SOM values', () => {
      const withValues = scoreGeneration(createValidGTMResult());

      const zeroTiers = createValidGTMResult().tiers.map(t => ({
        ...t,
        tam: 0,
        sam: 0,
        som: 0,
      }));
      const zeroResult = scoreGeneration(createValidGTMResult({ tiers: zeroTiers }));

      expect(withValues.marketFit).toBeGreaterThan(zeroResult.marketFit);
    });

    it('should award context alignment bonus when description/targetMarket overlap with tier text', () => {
      const context = { description: 'SaaS analytics platform', targetMarket: 'SaaS companies' };
      const aligned = scoreGeneration(createValidGTMResult(), context);

      const noContext = scoreGeneration(createValidGTMResult(), {});

      // With context words matching tier text, score should be >= the no-context score
      expect(aligned.marketFit).toBeGreaterThanOrEqual(noContext.marketFit);
    });

    it('should score 0 for context alignment when no context words match', () => {
      const context = { description: 'quantum entanglement widgets', targetMarket: 'astronauts' };
      const misaligned = scoreGeneration(createValidGTMResult(), context);

      // Should still have persona/pain/TAM points but no context alignment bonus
      const noContext = scoreGeneration(createValidGTMResult(), {});

      // Without context, no alignment bonus at all; with mismatched context, alignment bonus is near 0
      // So scores should be close (difference only from near-zero alignment rounding)
      expect(Math.abs(misaligned.marketFit - noContext.marketFit)).toBeLessThanOrEqual(1);
    });
  });

  describe('Financial-coherence scoring (TS-6)', () => {
    it('should reward correct TAM > SAM > SOM hierarchy', () => {
      const correct = scoreGeneration(createValidGTMResult());

      // Inverted hierarchy: SOM > SAM > TAM
      const inverted = createValidGTMResult().tiers.map(t => ({
        ...t,
        tam: t.som,
        sam: t.tam,
        som: t.tam,
      }));
      const invertedResult = scoreGeneration(createValidGTMResult({ tiers: inverted }));

      expect(correct.financialCoherence).toBeGreaterThan(invertedResult.financialCoherence);
    });

    it('should give partial credit for tiers with positive TAM/SAM/SOM even if hierarchy is wrong', () => {
      const wrongHierarchy = createValidGTMResult().tiers.map(t => ({
        ...t,
        tam: 100,
        sam: 200,  // SAM > TAM (wrong)
        som: 300,  // SOM > SAM (wrong)
      }));
      const result = scoreGeneration(createValidGTMResult({ tiers: wrongHierarchy }));

      // Should still have some score (partial credit of 1 point per tier)
      expect(result.financialCoherence).toBeGreaterThan(0);
    });

    it('should reward channels with realistic CAC values (between 1 and 10000)', () => {
      const realistic = scoreGeneration(createValidGTMResult());

      // All channels with zero CAC
      const zeroCac = createValidGTMResult().channels.map(ch => ({
        ...ch,
        expected_cac: 0,
      }));
      const noCac = scoreGeneration(createValidGTMResult({ channels: zeroCac }));

      expect(realistic.financialCoherence).toBeGreaterThan(noCac.financialCoherence);
    });

    it('should reward diverse budget allocation (no single channel > 70% of total)', () => {
      const diverse = scoreGeneration(createValidGTMResult());

      // One channel gets 90% of budget
      const concentrated = createValidGTMResult().channels.map((ch, i) => ({
        ...ch,
        monthly_budget: i === 0 ? 90000 : 100,
      }));
      const concentratedResult = scoreGeneration(createValidGTMResult({ channels: concentrated }));

      expect(diverse.financialCoherence).toBeGreaterThan(concentratedResult.financialCoherence);
    });

    it('should score 0 financial coherence for tiers with all-zero TAM/SAM/SOM and channels with zero budgets', () => {
      const zeroTiers = createValidGTMResult().tiers.map(t => ({
        ...t,
        tam: 0,
        sam: 0,
        som: 0,
      }));
      const zeroChannels = createValidGTMResult().channels.map(ch => ({
        ...ch,
        monthly_budget: 0,
        expected_cac: 0,
      }));
      const result = scoreGeneration(createValidGTMResult({
        tiers: zeroTiers,
        channels: zeroChannels,
      }));

      expect(result.financialCoherence).toBe(0);
    });
  });

  describe('Edge cases (TS-7)', () => {
    it('should return all zeros for empty input object', () => {
      const result = scoreGeneration({});
      expect(result.total).toBe(0);
      expect(result.specificity).toBe(0);
      expect(result.actionability).toBe(0);
      expect(result.marketFit).toBe(0);
      expect(result.financialCoherence).toBe(0);
    });

    it('should return all zeros for null-ish fields', () => {
      const result = scoreGeneration({
        tiers: null,
        channels: null,
        launch_timeline: null,
      });
      expect(result.total).toBe(0);
      expect(result.specificity).toBe(0);
      expect(result.actionability).toBe(0);
      expect(result.marketFit).toBe(0);
      expect(result.financialCoherence).toBe(0);
    });

    it('should handle empty arrays gracefully', () => {
      const result = scoreGeneration({
        tiers: [],
        channels: [],
        launch_timeline: [],
      });
      expect(result.total).toBe(0);
    });

    it('should handle tiers with missing fields gracefully', () => {
      const result = scoreGeneration({
        tiers: [{ name: 'OnlyName' }, {}, { description: 'OnlyDesc' }],
        channels: [],
        launch_timeline: [],
      });
      // Should not throw, should produce a score >= 0
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it('should handle channels with missing fields gracefully', () => {
      const result = scoreGeneration({
        tiers: [],
        channels: [{ name: 'OnlyName' }, {}, { monthly_budget: 100 }],
        launch_timeline: [],
      });
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it('should handle default context parameter', () => {
      // scoreGeneration with only result, no context
      const result = scoreGeneration(createValidGTMResult());
      expect(result.total).toBeGreaterThan(0);
    });

    it('should produce a high score for the ideal well-formed GTM result', () => {
      const result = scoreGeneration(createValidGTMResult(), {
        description: 'SaaS analytics platform for companies',
        targetMarket: 'SaaS companies',
      });
      // A well-formed result with matching context should score reasonably high
      expect(result.total).toBeGreaterThan(50);
    });
  });
});
