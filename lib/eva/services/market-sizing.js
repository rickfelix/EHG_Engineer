/**
 * Market Sizing Service
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-G
 *
 * Analyzes total addressable market (TAM), serviceable addressable market (SAM),
 * and serviceable obtainable market (SOM) for a venture.
 */

import { createService } from '../shared-services.js';

export const marketSizingService = createService({
  name: 'market-sizing',
  capabilities: ['market-analysis', 'tam-sam-som', 'market-sizing'],
  stages: [1, 2, 3],
  async executeFn(context) {
    const { venture } = context;
    const metadata = venture?.metadata || {};

    return {
      ventureId: venture?.id,
      analysis: {
        tam: metadata.market_size_tam || null,
        sam: metadata.market_size_sam || null,
        som: metadata.market_size_som || null,
        methodology: 'top-down',
        confidence: metadata.market_size_tam ? 'medium' : 'low',
      },
      recommendations: [
        'Validate TAM assumptions with primary research',
        'Identify key market segments for SAM refinement',
      ],
    };
  },
});
