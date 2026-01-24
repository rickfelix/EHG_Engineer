/**
 * GET /api/leo/gate-scores
 * SD-LEO-GEN-REMEDIATE-CRITICAL-SECURITY-001: Added authentication
 *
 * Retrieve gate scores for a PRD
 * Includes historical data and current status
 *
 * SECURITY: Requires authenticated user. Uses user-scoped Supabase client
 * that respects RLS policies.
 */

import { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../lib/middleware/api-auth';
import {
  GateScoresQuery,
  GateScoresResponse,
  validateWithDetails,
  Gate
} from '../../../lib/validation/leo-schemas';

// Rate limiting map (simple in-memory for now)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute in ms

/**
 * Simple rate limiter
 */
function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(clientId);

  if (!limit || limit.resetAt < now) {
    // New window
    rateLimitMap.set(clientId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (limit.count >= RATE_LIMIT) {
    return false; // Rate limited
  }

  limit.count++;
  return true;
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const { supabase } = req;

  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      allowed: ['GET']
    });
  }

  // Rate limiting by user ID (authenticated)
  const clientId = req.user.id;

  if (!checkRateLimit(clientId)) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: 60
    });
  }

  // Validate query parameters
  const validation = validateWithDetails(GateScoresQuery, req.query);

  if (!validation.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: validation.errors
    });
  }

  const { prd_id } = validation.data;

  try {
    // 1) Check if PRD exists
    const { data: prd, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('id, title')
      .eq('id', prd_id)
      .single();

    if (prdError || !prd) {
      return res.status(404).json({
        error: 'PRD not found',
        prd_id
      });
    }

    // 2) Get latest gate scores
    const gates: Gate[] = ['2A', '2B', '2C', '2D', '3'];
    const gateScores: Record<Gate, { score: number; passed: boolean; last_updated: string }> = {} as any;

    for (const gate of gates) {
      // Get most recent review for each gate
      const { data: review } = await supabase
        .from('leo_gate_reviews')
        .select('score, created_at')
        .eq('prd_id', prd_id)
        .eq('gate', gate)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (review) {
        gateScores[gate] = {
          score: Number(review.score),
          passed: Number(review.score) >= 85,
          last_updated: review.created_at
        };
      } else {
        // No review yet
        gateScores[gate] = {
          score: 0,
          passed: false,
          last_updated: new Date().toISOString()
        };
      }
    }

    // 3) Get historical data (last 10 reviews per gate)
    const { data: history, error: historyError } = await supabase
      .from('leo_gate_reviews')
      .select('gate, score, evidence, created_at')
      .eq('prd_id', prd_id)
      .order('created_at', { ascending: false })
      .limit(50); // Max 10 per gate × 5 gates

    if (historyError) {
      console.error('Failed to fetch history:', historyError);
    }

    // 4) Calculate last_updated across all gates
    const allUpdates = Object.values(gateScores)
      .map(g => new Date(g.last_updated).getTime())
      .filter(t => t > 0);

    const lastUpdated = allUpdates.length > 0
      ? new Date(Math.max(...allUpdates)).toISOString()
      : null;

    // 5) Build response
    const response: GateScoresResponse = {
      prd_id,
      gates: gateScores,
      history: (history || []).map(h => ({
        gate: h.gate as Gate,
        score: Number(h.score),
        evidence: h.evidence || {},
        created_at: h.created_at
      })),
      last_updated: lastUpdated,
      total_gates: 5
    };

    // Success
    return res.status(200).json(response);

  } catch (error) {
    console.error('Gate scores error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// SECURITY: Wrap handler with authentication middleware
export default withAuth(handler);