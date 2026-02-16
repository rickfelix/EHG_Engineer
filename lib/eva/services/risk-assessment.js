/**
 * Risk Assessment Engine Service
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-G
 *
 * Evaluates venture risks across multiple dimensions.
 */

import { createService } from '../shared-services.js';

export const riskAssessmentService = createService({
  name: 'risk-assessment',
  capabilities: ['risk-analysis', 'risk-scoring'],
  stages: [2, 3, 4, 5, 10],
  async executeFn(context) {
    const { venture } = context;
    const metadata = venture?.metadata || {};
    const risks = metadata.risks || [];

    const riskScores = risks.map((r, i) => ({
      id: `RISK-${i + 1}`,
      category: r.category || 'general',
      description: typeof r === 'string' ? r : r.description || 'Unknown',
      likelihood: r.likelihood || 'medium',
      impact: r.impact || 'medium',
      score: (r.likelihood_score || 5) * (r.impact_score || 5),
      mitigation: r.mitigation || null,
    }));

    const totalScore = riskScores.reduce((sum, r) => sum + r.score, 0);
    const avgScore = riskScores.length > 0 ? totalScore / riskScores.length : 0;

    return {
      ventureId: venture?.id,
      analysis: {
        riskCount: riskScores.length,
        risks: riskScores,
        overallRiskScore: avgScore,
        riskLevel: avgScore >= 50 ? 'high' : avgScore >= 25 ? 'medium' : 'low',
      },
      recommendations: avgScore >= 50
        ? ['Develop detailed mitigation plans for high-scoring risks']
        : ['Monitor identified risks quarterly'],
    };
  },
});
