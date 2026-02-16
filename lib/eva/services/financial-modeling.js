/**
 * Financial Modeling Service
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-G
 *
 * Provides financial projections and analysis for ventures.
 */

import { createService } from '../shared-services.js';

export const financialModelingService = createService({
  name: 'financial-modeling',
  capabilities: ['financial-analysis', 'projections', 'revenue-modeling'],
  stages: [3, 4, 5, 10, 15],
  async executeFn(context) {
    const { venture } = context;
    const metadata = venture?.metadata || {};
    const financials = metadata.financials || {};

    return {
      ventureId: venture?.id,
      analysis: {
        revenue: financials.projected_revenue || null,
        costs: financials.projected_costs || null,
        margin: financials.projected_revenue && financials.projected_costs
          ? ((financials.projected_revenue - financials.projected_costs) / financials.projected_revenue * 100).toFixed(1) + '%'
          : null,
        breakEvenMonths: financials.break_even_months || null,
        runway: financials.runway_months || null,
        fundingRequired: financials.funding_required || null,
      },
      recommendations: [
        !financials.projected_revenue ? 'Define revenue projections with supporting assumptions' : null,
        !financials.break_even_months ? 'Calculate break-even timeline' : null,
        'Validate financial assumptions with industry benchmarks',
      ].filter(Boolean),
    };
  },
});
