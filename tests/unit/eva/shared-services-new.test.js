/**
 * Unit tests for new shared services (Child G)
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-G
 */

import { describe, it, expect } from 'vitest';
import { marketSizingService } from '../../../lib/eva/services/market-sizing.js';
import { painPointAnalyzerService } from '../../../lib/eva/services/pain-point-analyzer.js';
import { strategicFitEvaluatorService } from '../../../lib/eva/services/strategic-fit-evaluator.js';
import { riskAssessmentService } from '../../../lib/eva/services/risk-assessment.js';
import { financialModelingService } from '../../../lib/eva/services/financial-modeling.js';
import { dependencyResolutionService } from '../../../lib/eva/services/dependency-resolution.js';

// execute() returns { success, data, duration } — assertions use result.data.*

describe('Market Sizing Service', () => {
  it('returns analysis with TAM/SAM/SOM from metadata', async () => {
    const result = await marketSizingService.execute({
      venture: { id: 'v1', metadata: { market_size_tam: 1000000, market_size_sam: 500000, market_size_som: 100000 } },
    });
    expect(result.success).toBe(true);
    expect(result.data.analysis.tam).toBe(1000000);
    expect(result.data.analysis.sam).toBe(500000);
    expect(result.data.analysis.som).toBe(100000);
    expect(result.data.analysis.confidence).toBe('medium');
  });

  it('returns low confidence when no TAM data', async () => {
    const result = await marketSizingService.execute({ venture: { id: 'v1', metadata: {} } });
    expect(result.data.analysis.tam).toBeNull();
    expect(result.data.analysis.confidence).toBe('low');
  });

  it('has correct service metadata', () => {
    expect(marketSizingService.name).toBe('market-sizing');
    expect(marketSizingService.capabilities).toContain('tam-sam-som');
  });
});

describe('Pain Point Analyzer Service', () => {
  it('analyzes pain points from metadata', async () => {
    const result = await painPointAnalyzerService.execute({
      venture: { id: 'v1', metadata: { pain_points: [
        { description: 'Slow onboarding', severity: 'high', frequency: 'daily' },
        { description: 'Poor UX', severity: 'medium' },
        'Simple string pain point',
      ] } },
    });
    expect(result.data.analysis.painPointCount).toBe(3);
    expect(result.data.analysis.painPoints[0].description).toBe('Slow onboarding');
    expect(result.data.analysis.painPoints[2].description).toBe('Simple string pain point');
    expect(result.data.analysis.coverage).toBe('adequate');
  });

  it('flags needs-research when fewer than 3 pain points', async () => {
    const result = await painPointAnalyzerService.execute({
      venture: { id: 'v1', metadata: { pain_points: [{ description: 'One issue' }] } },
    });
    expect(result.data.analysis.coverage).toBe('needs-research');
    expect(result.data.recommendations).toContain('Conduct more customer interviews to identify pain points');
  });
});

describe('Strategic Fit Evaluator Service', () => {
  it('evaluates fit factors and computes overall score', async () => {
    const result = await strategicFitEvaluatorService.execute({
      venture: { id: 'v1', metadata: {
        market_alignment_score: 8, competency_match_score: 7,
        synergy_score: 9, resource_score: 6,
      } },
    });
    expect(result.data.analysis.overallFit).toBe(7.5);
    expect(result.data.analysis.fitCategory).toBe('strong');
  });

  it('returns weak fit for low scores', async () => {
    const result = await strategicFitEvaluatorService.execute({
      venture: { id: 'v1', metadata: { market_alignment_score: 2, competency_match_score: 1 } },
    });
    expect(result.data.analysis.fitCategory).toBe('weak');
  });
});

describe('Risk Assessment Service', () => {
  it('scores risks and computes overall level', async () => {
    const result = await riskAssessmentService.execute({
      venture: { id: 'v1', metadata: { risks: [
        { category: 'market', description: 'Competition', likelihood_score: 8, impact_score: 7 },
        { category: 'tech', description: 'Scalability', likelihood_score: 3, impact_score: 4 },
      ] } },
    });
    expect(result.data.analysis.riskCount).toBe(2);
    expect(result.data.analysis.risks[0].score).toBe(56);
    expect(result.data.analysis.risks[1].score).toBe(12);
    expect(result.data.analysis.overallRiskScore).toBe(34);
    expect(result.data.analysis.riskLevel).toBe('medium');
  });

  it('returns low risk when no risks present', async () => {
    const result = await riskAssessmentService.execute({
      venture: { id: 'v1', metadata: {} },
    });
    expect(result.data.analysis.riskCount).toBe(0);
    expect(result.data.analysis.riskLevel).toBe('low');
  });

  it('handles string-only risk entries', async () => {
    const result = await riskAssessmentService.execute({
      venture: { id: 'v1', metadata: { risks: ['Market saturation'] } },
    });
    expect(result.data.analysis.risks[0].description).toBe('Market saturation');
    expect(result.data.analysis.risks[0].score).toBe(25); // 5*5 defaults
  });
});

describe('Financial Modeling Service', () => {
  it('computes margin from revenue and costs', async () => {
    const result = await financialModelingService.execute({
      venture: { id: 'v1', metadata: { financials: {
        projected_revenue: 200000, projected_costs: 120000,
        break_even_months: 18, runway_months: 24,
      } } },
    });
    expect(result.data.analysis.revenue).toBe(200000);
    expect(result.data.analysis.margin).toBe('40.0%');
    expect(result.data.analysis.breakEvenMonths).toBe(18);
  });

  it('returns null margin when data missing', async () => {
    const result = await financialModelingService.execute({
      venture: { id: 'v1', metadata: {} },
    });
    expect(result.data.analysis.margin).toBeNull();
    expect(result.data.recommendations).toContain('Define revenue projections with supporting assumptions');
  });
});

describe('Dependency Resolution Service', () => {
  it('categorizes dependencies by status', async () => {
    const result = await dependencyResolutionService.execute({
      venture: { id: 'v1', metadata: { dependencies: [
        { name: 'API Ready', status: 'resolved' },
        { name: 'DB Migration', status: 'blocked', type: 'internal', owner: 'dba-team' },
        { name: 'Design Review', status: 'pending' },
      ] } },
    });
    expect(result.data.analysis.totalDependencies).toBe(3);
    expect(result.data.analysis.resolved).toBe(1);
    expect(result.data.analysis.blocked).toBe(1);
    expect(result.data.analysis.pending).toBe(1);
    expect(result.data.analysis.isBlocked).toBe(true);
    expect(result.data.analysis.blockers[0].name).toBe('DB Migration');
  });

  it('reports not blocked when all resolved', async () => {
    const result = await dependencyResolutionService.execute({
      venture: { id: 'v1', metadata: { dependencies: [
        { name: 'Done', status: 'resolved' },
      ] } },
    });
    expect(result.data.analysis.isBlocked).toBe(false);
    expect(result.data.recommendations).toContain('All dependencies resolved — proceed to next stage');
  });

  it('handles empty dependencies', async () => {
    const result = await dependencyResolutionService.execute({
      venture: { id: 'v1', metadata: {} },
    });
    expect(result.data.analysis.totalDependencies).toBe(0);
    expect(result.data.analysis.isBlocked).toBe(false);
  });
});
