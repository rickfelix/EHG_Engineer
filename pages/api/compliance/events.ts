/**
 * GET/PATCH /api/compliance/events
 * SD-AUTO-COMPLIANCE-ENGINE-001: CCE Compliance Events API
 * SD-LEO-GEN-REMEDIATE-CRITICAL-SECURITY-001: Added authentication
 * SD-SEC-AUTHORIZATION-RBAC-001: Added RBAC authorization
 *
 * Retrieve and update compliance events for UI consumption
 *
 * SECURITY:
 * - Authentication: Requires valid JWT token
 * - Authorization: GET requires 'compliance:read', PATCH requires 'compliance:write'
 * - Uses user-scoped Supabase client that respects RLS policies
 */

import { NextApiResponse } from 'next';
import {
  ComplianceEventsQuery,
  ComplianceEventPatchBody,
  validateWithDetails
} from '../../../lib/validation/leo-schemas';
import { withAuth, AuthenticatedRequest } from '../../../lib/middleware/api-auth';
import { getUserRole, hasPermission } from '../../../lib/middleware/rbac';

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  // SECURITY: Check RBAC permissions based on method
  // SD-SEC-AUTHORIZATION-RBAC-001
  const role = await getUserRole(req);

  if (req.method === 'GET') {
    if (!hasPermission(role, 'compliance:read')) {
      console.warn(`AUTHZ DENIED: User ${req.user.id} (role: ${role}) attempted compliance:read`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to view compliance events.',
        code: 'PERMISSION_DENIED'
      });
    }
    return handleGet(req, res);
  } else if (req.method === 'PATCH') {
    if (!hasPermission(role, 'compliance:write')) {
      console.warn(`AUTHZ DENIED: User ${req.user.id} (role: ${role}) attempted compliance:write`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to update compliance events. Required role: editor or admin.',
        code: 'PERMISSION_DENIED'
      });
    }
    return handlePatch(req, res);
  } else {
    return res.status(405).json({
      error: 'Method not allowed',
      allowed: ['GET', 'PATCH']
    });
  }
}

async function handleGet(req: AuthenticatedRequest, res: NextApiResponse) {
  const { supabase } = req;

  const validation = validateWithDetails(ComplianceEventsQuery, req.query);

  if (!validation.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: validation.errors
    });
  }

  const { limit = 50, offset = 0, event_type, is_read, since } = validation.data;

  try {
    let query = supabase
      .from('compliance_events')
      .select('*', { count: 'exact' })
      .order('emitted_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (event_type) {
      query = query.eq('event_type', event_type);
    }

    if (is_read !== undefined) {
      query = query.eq('is_read', is_read);
    }

    if (since) {
      query = query.gte('emitted_at', since);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Failed to fetch events:', error);
      return res.status(500).json({
        error: 'Failed to fetch events',
        message: error.message
      });
    }

    // Count unread events for badge
    const { count: unreadCount } = await supabase
      .from('compliance_events')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false);

    return res.status(200).json({
      events: data || [],
      unreadCount: unreadCount || 0,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit
      }
    });

  } catch (error) {
    console.error('Events error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handlePatch(req: AuthenticatedRequest, res: NextApiResponse) {
  const { supabase } = req;
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      error: 'Event ID is required'
    });
  }

  const validation = validateWithDetails(ComplianceEventPatchBody, req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: validation.errors
    });
  }

  const { is_read } = validation.data;

  try {
    const { data, error } = await supabase
      .from('compliance_events')
      .update({
        is_read,
        read_at: is_read ? new Date().toISOString() : null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update event:', error);
      return res.status(500).json({
        error: 'Failed to update event',
        message: error.message
      });
    }

    return res.status(200).json({
      event: data,
      updated: true
    });

  } catch (error) {
    console.error('Event update error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// SECURITY: Wrap handler with authentication middleware
// SD-SEC-AUTHORIZATION-RBAC-001: RBAC checks inside handler (method-specific)
export default withAuth(handler);
