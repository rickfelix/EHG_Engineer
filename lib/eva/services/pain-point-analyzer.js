/**
 * Pain Point Analyzer Service
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-G
 *
 * Analyzes customer pain points for a venture based on research data.
 */

import { createService } from '../shared-services.js';

export const painPointAnalyzerService = createService({
  name: 'pain-point-analyzer',
  capabilities: ['customer-analysis', 'pain-point-identification'],
  stages: [1, 2, 3, 4],
  async executeFn(context) {
    const { venture } = context;
    const metadata = venture?.metadata || {};
    const painPoints = metadata.pain_points || [];

    return {
      ventureId: venture?.id,
      analysis: {
        painPointCount: painPoints.length,
        painPoints: painPoints.map((pp, i) => ({
          id: `PP-${i + 1}`,
          description: typeof pp === 'string' ? pp : pp.description || 'Unknown',
          severity: pp.severity || 'medium',
          frequency: pp.frequency || 'unknown',
        })),
        coverage: painPoints.length >= 3 ? 'adequate' : 'needs-research',
      },
      recommendations: painPoints.length < 3
        ? ['Conduct more customer interviews to identify pain points']
        : ['Validate pain point severity rankings with quantitative data'],
    };
  },
});
