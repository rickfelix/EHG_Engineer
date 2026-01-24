/**
 * GET /api/aegis/violations
 * PUT /api/aegis/violations/:id/override (via query param)
 *
 * SD-AEGIS-GOVERNANCE-001: AEGIS Violations API
 * SD-LEO-GEN-REMEDIATE-CRITICAL-SECURITY-001: Added authentication
 * SD-SEC-AUTHORIZATION-RBAC-001: Added RBAC for violation overrides
 *
 * Retrieve and manage governance violations
 *
 * SECURITY:
 * - Authentication: Requires valid JWT token
 * - Authorization: PUT (override) requires 'violations:override' permission
 * - Uses user-scoped Supabase client that respects RLS policies
 */

import { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../lib/middleware/api-auth';
import { getUserRole, hasPermission } from '../../../lib/middleware/rbac';

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'PUT') {
    return handlePut(req, res);
  }

  return res.status(405).json({
    error: 'Method not allowed',
    allowed: ['GET', 'PUT']
  });
}

async function handleGet(req: AuthenticatedRequest, res: NextApiResponse) {
  const { supabase } = req;

  const {
    constitution,
    severity,
    status = 'open',
    sd_key,
    limit = '50',
    offset = '0',
    since
  } = req.query;

  // SD-SEC-DATA-VALIDATION-001: Safe integer parsing with bounds checking
  const parsedLimit = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 100);
  const parsedOffset = Math.max(parseInt(offset as string, 10) || 0, 0);

  try {
    let query = supabase
      .from('aegis_violations')
      .select(`
        id,
        severity,
        message,
        status,
        sd_key,
        actor_role,
        actor_id,
        operation_type,
        target_table,
        payload,
        override_justification,
        overridden_by,
        created_at,
        updated_at,
        rule:aegis_rules(rule_code, rule_name, severity, enforcement_action),
        constitution:aegis_constitutions(code, name, domain)
      `)
      .order('created_at', { ascending: false })
      .range(parsedOffset, parsedOffset + parsedLimit - 1);

    // Filter by constitution
    if (constitution && typeof constitution === 'string') {
      const { data: constData } = await supabase
        .from('aegis_constitutions')
        .select('id')
        .eq('code', constitution)
        .single();

      if (constData) {
        query = query.eq('constitution_id', constData.id);
      }
    }

    if (severity && typeof severity === 'string') {
      query = query.eq('severity', severity.toUpperCase());
    }

    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    if (sd_key && typeof sd_key === 'string') {
      query = query.eq('sd_key', sd_key);
    }

    if (since && typeof since === 'string') {
      // Parse "7d" format
      // SD-SEC-DATA-VALIDATION-001: Safe parsing with radix and bounds
      const days = Math.min(Math.max(parseInt(since.replace('d', ''), 10) || 7, 1), 365);
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);
      query = query.gte('created_at', sinceDate.toISOString());
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Failed to fetch AEGIS violations:', error);
      return res.status(500).json({
        error: 'Failed to fetch violations',
        message: error.message
      });
    }

    // Count by status
    const byStatus: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    (data || []).forEach(v => {
      byStatus[v.status] = (byStatus[v.status] || 0) + 1;
      bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
    });

    return res.status(200).json({
      violations: data || [],
      byStatus,
      bySeverity,
      total: count || data?.length || 0,
      limit: parsedLimit,
      offset: parsedOffset
    });

  } catch (error) {
    console.error('AEGIS violations error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handlePut(req: AuthenticatedRequest, res: NextApiResponse) {
  const { supabase, user } = req;
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      error: 'Missing violation ID'
    });
  }

  // SECURITY: Check RBAC permission for violation override
  // SD-SEC-AUTHORIZATION-RBAC-001
  const role = await getUserRole(req);
  if (!hasPermission(role, 'violations:override')) {
    console.warn(
      `AUTHZ DENIED: User ${user.id} (role: ${role}) attempted violations:override`
    );
    return res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have permission to override violations. Required role: editor or admin.',
      code: 'PERMISSION_DENIED'
    });
  }

  const { status, override_justification, overridden_by } = req.body;

  // Validate status
  const validStatuses = ['open', 'acknowledged', 'overridden', 'remediated', 'false_positive'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({
      error: 'Invalid status',
      validStatuses
    });
  }

  // If overriding, require justification
  if (status === 'overridden' && !override_justification) {
    return res.status(400).json({
      error: 'Override justification is required when status is "overridden"'
    });
  }

  try {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (status) updateData.status = status;
    if (override_justification) updateData.override_justification = override_justification;
    // Use authenticated user ID if not provided
    updateData.overridden_by = overridden_by || user.id;

    const { data, error } = await supabase
      .from('aegis_violations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update AEGIS violation:', error);
      return res.status(500).json({
        error: 'Failed to update violation',
        message: error.message
      });
    }

    return res.status(200).json({
      success: true,
      violation: data
    });

  } catch (error) {
    console.error('AEGIS violation update error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// SECURITY: Wrap handler with authentication middleware
export default withAuth(handler);
