/**
 * POST /api/competitor-analysis
 * SD-STAGE1-ENTRY-UX-001: Analyze competitor URL
 * SD-IDEATION-GENESIS-AUDIT: Real market intelligence (not hallucinated)
 * SD-LEO-GEN-REMEDIATE-CRITICAL-SECURITY-001: Added authentication
 * SD-SEC-AUTHORIZATION-RBAC-001: Added RBAC authorization
 *
 * Analyzes a competitor URL using REAL web fetching and AI analysis.
 * Classifies all outputs using Four Buckets (Facts/Assumptions/Simulations/Unknowns).
 *
 * SECURITY:
 * - Authentication: Requires valid JWT token
 * - Authorization: Requires 'ventures:create' permission (editor+) since used in venture creation
 * - Uses user-scoped Supabase client
 */

import { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, AuthenticatedRequest } from '../../lib/middleware/api-auth';
import { withPermission } from '../../lib/middleware/rbac';

// Request body validation schema
const AnalyzeCompetitorSchema = z.object({
  url: z.string().url('Please enter a valid URL'),
  include_full_analysis: z.boolean().optional().default(false)
});

// Fallback stub for when real analysis fails
function generateFallbackAnalysis(url: string, error: string) {
  let domain = '';
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = url;
  }

  return {
    name: `${domain.replace('www.', '').split('.')[0].toUpperCase()} Alternative`,
    problem_statement: `[Analysis failed: ${error}] - Unable to analyze competitor at ${domain}. Please try again or enter details manually.`,
    solution: 'Manual entry required - competitor analysis unavailable',
    target_market: 'To be determined',
    competitor_reference: url,
    four_buckets: {
      facts: [],
      assumptions: [],
      simulations: [],
      unknowns: [{ path: 'all', value: 'Analysis failed', evidence: error }]
    },
    quality: {
      confidence_score: 0,
      data_quality: 'failed',
      analysis_notes: `Real-time analysis failed: ${error}`
    },
    _fallback: true
  };
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      allowed: ['POST']
    });
  }

  // Validate request body
  const parsed = AnalyzeCompetitorSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid URL format',
      details: parsed.error.flatten().fieldErrors
    });
  }

  const { url, include_full_analysis } = parsed.data;

  try {
    // Dynamic import of the competitor intelligence service
    const { default: CompetitorIntelligenceService } = await import('../../lib/research/competitor-intelligence.js');
    const service = new CompetitorIntelligenceService();

    console.log(`[competitor-analysis] Analyzing: ${url}`);
    const startTime = Date.now();

    // Perform REAL analysis
    const analysis = await service.analyzeCompetitor(url);

    console.log(`[competitor-analysis] Complete in ${Date.now() - startTime}ms`);

    // Build response
    const response: Record<string, unknown> = {
      success: true,
      venture: {
        name: analysis.name,
        problem_statement: analysis.problem_statement,
        solution: analysis.solution,
        target_market: analysis.target_market,
        competitor_reference: analysis.competitor_reference
      },
      four_buckets_summary: {
        facts_count: analysis.four_buckets?.facts?.length || 0,
        assumptions_count: analysis.four_buckets?.assumptions?.length || 0,
        simulations_count: analysis.four_buckets?.simulations?.length || 0,
        unknowns_count: analysis.four_buckets?.unknowns?.length || 0
      },
      quality: analysis.quality,
      metadata: analysis.metadata
    };

    // Include full analysis if requested
    if (include_full_analysis) {
      response.full_analysis = {
        four_buckets: analysis.four_buckets,
        competitive_intelligence: analysis.competitive_intelligence
      };
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('[competitor-analysis] Error:', error);

    // Return fallback with error info
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const fallback = generateFallbackAnalysis(url, errorMessage);

    return res.status(200).json({
      success: true,
      venture: {
        name: fallback.name,
        problem_statement: fallback.problem_statement,
        solution: fallback.solution,
        target_market: fallback.target_market,
        competitor_reference: fallback.competitor_reference
      },
      four_buckets_summary: {
        facts_count: 0,
        assumptions_count: 0,
        simulations_count: 0,
        unknowns_count: 1
      },
      quality: fallback.quality,
      _fallback: true,
      _error: errorMessage
    });
  }
}

// SECURITY: Wrap handler with authentication and authorization middleware
// SD-SEC-AUTHORIZATION-RBAC-001: Requires ventures:create permission
export default withAuth(withPermission('ventures:create')(handler));
