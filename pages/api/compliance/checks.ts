/**
 * GET /api/compliance/checks
 * SD-AUTO-COMPLIANCE-ENGINE-001: CCE Compliance Checks API
 *
 * Retrieve compliance check history with filtering
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  ComplianceChecksQuery,
  validateWithDetails
} from '../../../lib/validation/leo-schemas';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      allowed: ['GET']
    });
  }

  const validation = validateWithDetails(ComplianceChecksQuery, req.query);

  if (!validation.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: validation.errors
    });
  }

  const { limit = 20, offset = 0, stage, run_type } = validation.data;

  try {
    let query = supabase
      .from('compliance_checks')
      .select('*', { count: 'exact' })
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (run_type) {
      query = query.eq('run_type', run_type);
    }

    // Filter by stage if provided (checks the metadata JSON)
    if (stage) {
      query = query.contains('metadata', { stages_requested: [stage] });
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Failed to fetch compliance checks:', error);
      return res.status(500).json({
        error: 'Failed to fetch compliance checks',
        message: error.message
      });
    }

    return res.status(200).json({
      checks: data || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit
      }
    });

  } catch (error) {
    console.error('Compliance checks error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
