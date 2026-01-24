/**
 * GET /api/aegis/stats
 * SD-AEGIS-GOVERNANCE-001: AEGIS Statistics API
 * SD-LEO-GEN-REMEDIATE-CRITICAL-SECURITY-001: Added authentication
 * SD-SEC-AUTHORIZATION-RBAC-001: Added RBAC authorization
 *
 * Retrieve compliance statistics
 *
 * SECURITY:
 * - Authentication: Requires valid JWT token
 * - Authorization: Requires 'violations:read' permission (viewer+)
 * - Uses user-scoped Supabase client that respects RLS policies
 */

import { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../lib/middleware/api-auth';
import { withPermission } from '../../../lib/middleware/rbac';

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

  const { period = '7d' } = req.query;

  // Parse period (e.g., "7d", "30d")
  const days = parseInt((period as string).replace('d', '')) || 7;
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  try {
    // Fetch constitutions with rule counts
    const { data: constitutions, error: constError } = await supabase
      .from('aegis_constitutions')
      .select('id, code, name, domain, enforcement_mode, is_active')
      .eq('is_active', true);

    if (constError) {
      console.error('Failed to fetch constitutions:', constError);
      return res.status(500).json({
        error: 'Failed to fetch constitutions',
        message: constError.message
      });
    }

    // Fetch rules
    const { data: rules, error: rulesError } = await supabase
      .from('aegis_rules')
      .select('id, constitution_id, severity, is_active')
      .eq('is_active', true);

    if (rulesError) {
      console.error('Failed to fetch rules:', rulesError);
      return res.status(500).json({
        error: 'Failed to fetch rules',
        message: rulesError.message
      });
    }

    // Fetch violations in period
    const { data: violations, error: violError } = await supabase
      .from('aegis_violations')
      .select('id, constitution_id, severity, status, created_at')
      .gte('created_at', sinceDate.toISOString());

    if (violError) {
      console.error('Failed to fetch violations:', violError);
      return res.status(500).json({
        error: 'Failed to fetch violations',
        message: violError.message
      });
    }

    // Aggregate stats
    const rulesByConstitution: Record<string, number> = {};
    const criticalRulesByConstitution: Record<string, number> = {};

    (rules || []).forEach(r => {
      rulesByConstitution[r.constitution_id] = (rulesByConstitution[r.constitution_id] || 0) + 1;
      if (r.severity === 'CRITICAL') {
        criticalRulesByConstitution[r.constitution_id] = (criticalRulesByConstitution[r.constitution_id] || 0) + 1;
      }
    });

    const violationsByConstitution: Record<string, number> = {};
    const violationsBySeverity: Record<string, number> = {};
    const violationsByStatus: Record<string, number> = {};

    (violations || []).forEach(v => {
      violationsByConstitution[v.constitution_id] = (violationsByConstitution[v.constitution_id] || 0) + 1;
      violationsBySeverity[v.severity] = (violationsBySeverity[v.severity] || 0) + 1;
      violationsByStatus[v.status] = (violationsByStatus[v.status] || 0) + 1;
    });

    // Build constitution summary
    const constitutionSummary = (constitutions || []).map(c => ({
      code: c.code,
      name: c.name,
      domain: c.domain,
      enforcement_mode: c.enforcement_mode,
      rules: rulesByConstitution[c.id] || 0,
      critical_rules: criticalRulesByConstitution[c.id] || 0,
      violations: violationsByConstitution[c.id] || 0
    }));

    // Calculate overall stats
    const totalRules = rules?.length || 0;
    const totalViolations = violations?.length || 0;
    const openViolations = violationsByStatus['open'] || 0;
    const complianceRate = totalViolations > 0
      ? ((totalViolations - openViolations) / totalViolations * 100)
      : 100;

    // Daily trend (last 7 days)
    const dailyTrend: { date: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const count = (violations || []).filter(v =>
        v.created_at.startsWith(dateStr)
      ).length;

      dailyTrend.push({ date: dateStr, count });
    }

    return res.status(200).json({
      period: `${days}d`,
      periodStart: sinceDate.toISOString(),

      overview: {
        totalConstitutions: constitutions?.length || 0,
        totalRules,
        totalViolations,
        openViolations,
        complianceRate: Math.round(complianceRate * 10) / 10
      },

      byConstitution: constitutionSummary,

      bySeverity: {
        CRITICAL: violationsBySeverity['CRITICAL'] || 0,
        HIGH: violationsBySeverity['HIGH'] || 0,
        MEDIUM: violationsBySeverity['MEDIUM'] || 0,
        LOW: violationsBySeverity['LOW'] || 0,
        ADVISORY: violationsBySeverity['ADVISORY'] || 0
      },

      byStatus: {
        open: violationsByStatus['open'] || 0,
        acknowledged: violationsByStatus['acknowledged'] || 0,
        overridden: violationsByStatus['overridden'] || 0,
        remediated: violationsByStatus['remediated'] || 0,
        false_positive: violationsByStatus['false_positive'] || 0
      },

      dailyTrend
    });

  } catch (error) {
    console.error('AEGIS stats error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// SECURITY: Wrap handler with authentication and authorization middleware
// SD-SEC-AUTHORIZATION-RBAC-001: Requires violations:read permission
export default withAuth(withPermission('violations:read')(handler));
