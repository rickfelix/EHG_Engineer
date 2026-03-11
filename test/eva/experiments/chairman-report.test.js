/**
 * Chairman Report Generator Tests
 *
 * SD-MAN-ORCH-STAGE-ZERO-COLD-001-F
 */

import { describe, test, expect } from 'vitest';
import { generateChairmanReport } from '../../../lib/eva/experiments/chairman-report.js';

// ── Fixtures ──────────────────────────────────────────

const conclusiveAnalysis = {
  status: 'conclusive',
  total_samples: 50,
  per_variant: {
    control: {
      count: 25,
      mean_score: 65.0,
      posterior: { alpha: 18, beta: 9 },
      credible_interval: { lower: 0.45, upper: 0.82, level: 0.95 },
    },
    variant_a: {
      count: 25,
      mean_score: 78.0,
      posterior: { alpha: 22, beta: 5 },
      credible_interval: { lower: 0.62, upper: 0.94, level: 0.95 },
    },
  },
  comparisons: [
    { variantA: 'control', variantB: 'variant_a', probABetterThanB: 0.12, probBBetterThanA: 0.88 },
  ],
  stopping: { shouldStop: true, reason: "'variant_a' beats 'control' with P=0.950", winner: 'variant_a' },
  recommendation: "STOP: 'variant_a' beats 'control' with P=0.950",
};

const runningAnalysis = {
  status: 'running',
  total_samples: 10,
  per_variant: {
    control: {
      count: 5,
      mean_score: 60.0,
      posterior: { alpha: 4, beta: 3 },
      credible_interval: { lower: 0.20, upper: 0.88, level: 0.95 },
    },
    variant_a: {
      count: 5,
      mean_score: 62.0,
      posterior: { alpha: 4, beta: 3 },
      credible_interval: { lower: 0.22, upper: 0.89, level: 0.95 },
    },
  },
  comparisons: [
    { variantA: 'control', variantB: 'variant_a', probABetterThanB: 0.45, probBBetterThanA: 0.55 },
  ],
  stopping: { shouldStop: false, reason: 'No clear winner yet' },
  recommendation: 'CONTINUE: 10 samples collected, need 20 minimum',
};

// ── Tests ─────────────────────────────────────────────

describe('generateChairmanReport', () => {
  test('throws when analysis is missing', () => {
    expect(() => generateChairmanReport(null)).toThrow('analysis is required');
    expect(() => generateChairmanReport(undefined)).toThrow('analysis is required');
  });

  test('returns complete report structure', () => {
    const report = generateChairmanReport(conclusiveAnalysis);

    expect(report).toHaveProperty('sections');
    expect(report).toHaveProperty('recommendation');
    expect(report).toHaveProperty('promotionCandidate');
    expect(report).toHaveProperty('formatted');
    expect(report.sections).toHaveLength(5);
  });

  test('sections have correct titles', () => {
    const report = generateChairmanReport(conclusiveAnalysis);
    const titles = report.sections.map(s => s.title);

    expect(titles).toEqual([
      'Executive Summary',
      'Variant Performance',
      'Statistical Confidence',
      'Effect Size Analysis',
      'Recommendation',
    ]);
  });

  test('executive summary shows experiment metadata', () => {
    const report = generateChairmanReport(conclusiveAnalysis, {
      experimentName: 'My Test Experiment',
    });

    const summary = report.sections[0].content;
    expect(summary.experiment).toBe('My Test Experiment');
    expect(summary.status).toBe('CONCLUSIVE');
    expect(summary.total_samples).toBe(50);
    expect(summary.variants_tested).toBe(2);
  });

  test('variant performance includes all variants', () => {
    const report = generateChairmanReport(conclusiveAnalysis);
    const variants = report.sections[1].content.variants;

    expect(variants).toHaveLength(2);
    expect(variants[0].name).toBe('control');
    expect(variants[1].name).toBe('variant_a');
    expect(variants[0].mean_score).toBe(65.0);
    expect(variants[1].mean_score).toBe(78.0);
  });

  test('statistical confidence shows pairwise comparisons', () => {
    const report = generateChairmanReport(conclusiveAnalysis);
    const confidence = report.sections[2].content;

    expect(confidence.comparisons).toHaveLength(1);
    expect(confidence.comparisons[0].pair).toBe('control vs variant_a');
    expect(confidence.comparisons[0].favored).toBe('variant_a');
    expect(confidence.stopping_status).toBe('REACHED');
  });

  test('effect size analysis computes differences', () => {
    const report = generateChairmanReport(conclusiveAnalysis);
    const effects = report.sections[3].content.effects;

    expect(effects).toHaveLength(1);
    expect(effects[0].baseline).toBe('control');
    expect(effects[0].variant).toBe('variant_a');
    expect(effects[0].absolute_diff).toBe(13);
    expect(effects[0].relative_pct).toBe(20);
    expect(effects[0].magnitude).toBe('large');
  });

  test('recommends PROMOTE when winner exceeds threshold', () => {
    const highConfAnalysis = {
      ...conclusiveAnalysis,
      comparisons: [
        { variantA: 'control', variantB: 'variant_a', probABetterThanB: 0.05, probBBetterThanA: 0.95 },
      ],
    };

    const report = generateChairmanReport(highConfAnalysis, {
      confidenceThreshold: 0.90,
    });

    expect(report.recommendation.action).toBe('PROMOTE');
    expect(report.recommendation.variant).toBe('variant_a');
    expect(report.recommendation.confidence).toBeGreaterThanOrEqual(0.90);
  });

  test('recommends REJECT when confidence below threshold', () => {
    const lowConfAnalysis = {
      ...conclusiveAnalysis,
      comparisons: [
        { variantA: 'control', variantB: 'variant_a', probABetterThanB: 0.25, probBBetterThanA: 0.75 },
      ],
    };

    const report = generateChairmanReport(lowConfAnalysis, {
      confidenceThreshold: 0.90,
    });

    expect(report.recommendation.action).toBe('REJECT');
  });

  test('recommends CONTINUE for running experiments', () => {
    const report = generateChairmanReport(runningAnalysis);

    expect(report.recommendation.action).toBe('CONTINUE');
    expect(report.recommendation.variant).toBeNull();
  });

  test('identifies promotion candidate when winner meets threshold', () => {
    const highConfAnalysis = {
      ...conclusiveAnalysis,
      comparisons: [
        { variantA: 'control', variantB: 'variant_a', probABetterThanB: 0.05, probBBetterThanA: 0.95 },
      ],
    };

    const report = generateChairmanReport(highConfAnalysis, {
      confidenceThreshold: 0.90,
    });

    expect(report.promotionCandidate).not.toBeNull();
    expect(report.promotionCandidate.variant).toBe('variant_a');
    expect(report.promotionCandidate.meetsThreshold).toBe(true);
  });

  test('no promotion candidate for running experiments', () => {
    const report = generateChairmanReport(runningAnalysis);
    expect(report.promotionCandidate).toBeNull();
  });

  test('formatted report contains section headers', () => {
    const report = generateChairmanReport(conclusiveAnalysis);

    expect(report.formatted).toContain('CHAIRMAN EXPERIMENT REPORT');
    expect(report.formatted).toContain('Executive Summary');
    expect(report.formatted).toContain('Variant Performance');
    expect(report.formatted).toContain('Statistical Confidence');
    expect(report.formatted).toContain('Effect Size Analysis');
    expect(report.formatted).toContain('Recommendation');
  });

  test('classifies effect sizes correctly', () => {
    // negligible: <2%
    const tinyDiff = {
      ...conclusiveAnalysis,
      per_variant: {
        control: { ...conclusiveAnalysis.per_variant.control, mean_score: 70.0 },
        variant_a: { ...conclusiveAnalysis.per_variant.variant_a, mean_score: 71.0 },
      },
    };

    const report = generateChairmanReport(tinyDiff);
    const effects = report.sections[3].content.effects;
    expect(effects[0].magnitude).toBe('negligible');
  });
});
