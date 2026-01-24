/**
 * GET /api/compliance/events
 * SD-AUTO-COMPLIANCE-ENGINE-001: CCE Compliance Events API
 * SD-LEO-GEN-REMEDIATE-CRITICAL-SECURITY-001: Added authentication
 *
 * Retrieve compliance events for UI consumption
 *
 * SECURITY: Requires authenticated user. Uses user-scoped Supabase client
 * that respects RLS policies.
 */

import { NextApiResponse } from 'next';
import {
  ComplianceEventsQuery,
  ComplianceEventPatchBody,
  validateWithDetails
} from '../../../lib/validation/leo-schemas';
import { withAuth, AuthenticatedRequest } from '../../../lib/middleware/api-auth';

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'PATCH') {
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
export default withAuth(handler);
