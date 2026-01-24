/**
 * GET /api/compliance/policies
 * SD-AUTO-COMPLIANCE-ENGINE-001: CCE Policy Registry API
 * SD-LEO-GEN-REMEDIATE-CRITICAL-SECURITY-001: Added authentication
 *
 * Retrieve compliance policies from the registry
 *
 * SECURITY: Requires authenticated user. Uses user-scoped Supabase client
 * that respects RLS policies.
 */

import { NextApiResponse } from 'next';
import {
  CompliancePoliciesQuery,
  validateWithDetails
} from '../../../lib/validation/leo-schemas';
import { withAuth, AuthenticatedRequest } from '../../../lib/middleware/api-auth';

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

  const validation = validateWithDetails(CompliancePoliciesQuery, req.query);

  if (!validation.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: validation.errors
    });
  }

  const { category, is_active, severity } = validation.data;

  try {
    let query = supabase
      .from('compliance_policies')
      .select('*')
      .order('category', { ascending: true })
      .order('severity', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active);
    }

    if (severity) {
      query = query.eq('severity', severity);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch policies:', error);
      return res.status(500).json({
        error: 'Failed to fetch policies',
        message: error.message
      });
    }

    // Group by category for UI consumption
    const byCategory: Record<string, typeof data> = {};
    (data || []).forEach(policy => {
      if (!byCategory[policy.category]) {
        byCategory[policy.category] = [];
      }
      byCategory[policy.category].push(policy);
    });

    return res.status(200).json({
      policies: data || [],
      byCategory,
      total: data?.length || 0,
      activeCount: data?.filter(p => p.is_active).length || 0
    });

  } catch (error) {
    console.error('Policies error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// SECURITY: Wrap handler with authentication middleware
export default withAuth(handler);
