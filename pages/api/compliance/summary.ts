/**
 * GET /api/compliance/summary
 * SD-AUTO-COMPLIANCE-ENGINE-001: CCE Compliance Summary API
 *
 * Get overall compliance summary for dashboard
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

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

  try {
    // Get latest compliance check
    const { data: latestCheck, error: checkError } = await supabase
      .from('compliance_checks')
      .select('*')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Failed to fetch latest check:', checkError);
    }

    // Get violation counts by severity
    const { data: violationsByType, error: violationsError } = await supabase
      .from('compliance_violations')
      .select('severity, status')
      .eq('status', 'open');

    if (violationsError) {
      console.error('Failed to fetch violations:', violationsError);
    }

    // Count violations by severity
    const severityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0
    };

    (violationsByType || []).forEach(v => {
      if (severityCounts[v.severity as keyof typeof severityCounts] !== undefined) {
        severityCounts[v.severity as keyof typeof severityCounts]++;
      }
    });

    // Get active policy count
    const { count: activePolicies } = await supabase
      .from('compliance_policies')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    // Get unread events count
    const { count: unreadEvents } = await supabase
      .from('compliance_events')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false);

    // Calculate health score (simplified)
    const openViolations = violationsByType?.length || 0;
    const criticalCount = severityCounts.critical;
    const highCount = severityCounts.high;

    let healthScore = 100;
    healthScore -= criticalCount * 15;
    healthScore -= highCount * 5;
    healthScore -= (openViolations - criticalCount - highCount) * 2;
    healthScore = Math.max(0, Math.min(100, healthScore));

    const healthStatus =
      healthScore >= 90 ? 'healthy' :
      healthScore >= 70 ? 'warning' :
      healthScore >= 50 ? 'degraded' : 'critical';

    return res.status(200).json({
      health: {
        score: healthScore,
        status: healthStatus
      },
      latestCheck: latestCheck ? {
        runId: latestCheck.run_id,
        completedAt: latestCheck.completed_at,
        passed: latestCheck.passed,
        failed: latestCheck.failed,
        criticalScore: latestCheck.critical_score,
        overallScore: latestCheck.overall_score
      } : null,
      violations: {
        total: openViolations,
        ...severityCounts
      },
      policies: {
        active: activePolicies || 0
      },
      events: {
        unread: unreadEvents || 0
      },
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Summary error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
