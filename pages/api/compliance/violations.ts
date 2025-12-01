/**
 * GET /api/compliance/violations
 * SD-AUTO-COMPLIANCE-ENGINE-001: CCE Compliance Violations API
 *
 * Retrieve compliance violations with filtering
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  ComplianceViolationsQuery,
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

  const validation = validateWithDetails(ComplianceViolationsQuery, req.query);

  if (!validation.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: validation.errors
    });
  }

  const { limit = 20, offset = 0, stage, severity, status } = validation.data;

  try {
    let query = supabase
      .from('compliance_violations')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (stage) {
      query = query.eq('stage_number', stage);
    }

    if (severity) {
      query = query.eq('severity', severity);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Failed to fetch violations:', error);
      return res.status(500).json({
        error: 'Failed to fetch violations',
        message: error.message
      });
    }

    // Group by stage for summary
    const stagesSummary: Record<number, { total: number; critical: number; high: number }> = {};
    (data || []).forEach(v => {
      if (!stagesSummary[v.stage_number]) {
        stagesSummary[v.stage_number] = { total: 0, critical: 0, high: 0 };
      }
      stagesSummary[v.stage_number].total++;
      if (v.severity === 'critical') stagesSummary[v.stage_number].critical++;
      if (v.severity === 'high') stagesSummary[v.stage_number].high++;
    });

    return res.status(200).json({
      violations: data || [],
      summary: {
        total: count || 0,
        byStage: stagesSummary
      },
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit
      }
    });

  } catch (error) {
    console.error('Violations error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
