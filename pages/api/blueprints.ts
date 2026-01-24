/**
 * GET /api/blueprints
 * SD-STAGE1-ENTRY-UX-001: Retrieve blueprint catalog
 * SD-LEO-GEN-REMEDIATE-CRITICAL-SECURITY-001: Added authentication
 *
 * Returns blueprint catalog with optional category/market filters.
 *
 * SECURITY: Requires authenticated user. Uses user-scoped Supabase client
 * that respects RLS policies.
 */

import { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, AuthenticatedRequest } from '../../lib/middleware/api-auth';

// Query params validation schema
const BlueprintQuerySchema = z.object({
  category: z.string().optional(),
  market: z.string().optional()
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const { supabase } = req;

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      allowed: ['GET']
    });
  }

  // Validate query params
  const parsed = BlueprintQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.flatten().fieldErrors
    });
  }

  const { category, market } = parsed.data;

  try {
    let query = supabase
      .from('opportunity_blueprints')
      .select('id, title, summary, problem, solution, target_market, category, market')
      .order('title', { ascending: true });

    if (category) {
      query = query.ilike('category', `%${category}%`);
    }

    if (market) {
      query = query.ilike('market', `%${market}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch blueprints:', error);
      return res.status(500).json({
        error: 'Failed to fetch blueprints',
        message: error.message
      });
    }

    return res.status(200).json({
      blueprints: data || []
    });

  } catch (error) {
    console.error('Blueprints error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// SECURITY: Wrap handler with authentication middleware
export default withAuth(handler);
