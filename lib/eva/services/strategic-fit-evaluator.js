/**
 * Strategic Fit Evaluator Service
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-G
 *
 * Evaluates how well a venture fits the portfolio strategy.
 */

import { createService } from '../shared-services.js';

export const strategicFitEvaluatorService = createService({
  name: 'strategic-fit-evaluator',
  capabilities: ['strategic-analysis', 'portfolio-fit'],
  stages: [2, 3, 5],
  async executeFn(context) {
    const { venture } = context;
    const metadata = venture?.metadata || {};

    const factors = {
      marketAlignment: metadata.market_alignment_score || 0,
      coreCompetencyMatch: metadata.competency_match_score || 0,
      synergyPotential: metadata.synergy_score || 0,
      resourceAvailability: metadata.resource_score || 0,
    };

    const scores = Object.values(factors);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    return {
      ventureId: venture?.id,
      analysis: {
        factors,
        overallFit: avgScore,
        fitCategory: avgScore >= 7 ? 'strong' : avgScore >= 4 ? 'moderate' : 'weak',
      },
      recommendations: avgScore < 4
        ? ['Consider repositioning venture to improve strategic alignment']
        : ['Proceed with current strategic positioning'],
    };
  },
});
