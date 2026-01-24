/**
 * GET/POST /api/ventures
 * SD-STAGE1-ENTRY-UX-001: Create venture with origin tracking
 * SD-IDEATION-GENESIS-AUDIT: Capture raw_chairman_intent at creation
 * SD-LEO-GEN-REMEDIATE-CRITICAL-SECURITY-001: Added authentication
 * SD-SEC-AUTHORIZATION-RBAC-001: Added RBAC authorization
 *
 * Creates a new venture in Stage 1 with origin_type tracking
 * (manual, competitor_clone, or blueprint)
 *
 * Captures Chairman's original vision in raw_chairman_intent (immutable)
 *
 * SECURITY:
 * - Authentication: Requires valid JWT token
 * - Authorization: GET requires 'ventures:read', POST requires 'ventures:create'
 * - Uses user-scoped Supabase client that respects RLS policies
 */

import { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, AuthenticatedRequest } from '../../lib/middleware/api-auth';
import { getUserRole, hasPermission } from '../../lib/middleware/rbac';

// Request body validation schema
const CreateVentureSchema = z.object({
  name: z.string().min(1, 'Venture name is required'),
  problem_statement: z.string().min(1, 'Problem statement is required'),
  solution: z.string().min(1, 'Solution is required'),
  target_market: z.string().min(1, 'Target market is required'),
  origin_type: z.enum(['manual', 'competitor_clone', 'blueprint']),
  competitor_ref: z.string().nullable().optional(),
  blueprint_id: z.string().nullable().optional()
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const { user, supabase } = req;

  // SECURITY: Check RBAC permissions based on method
  // SD-SEC-AUTHORIZATION-RBAC-001
  const role = await getUserRole(req);

  // GET: Fetch all ventures (user's ventures via RLS)
  if (req.method === 'GET') {
    if (!hasPermission(role, 'ventures:read')) {
      console.warn(`AUTHZ DENIED: User ${user.id} (role: ${role}) attempted ventures:read`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to view ventures.',
        code: 'PERMISSION_DENIED'
      });
    }

    try {
      const { data: ventures, error } = await supabase
        .from('ventures')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch ventures:', error);
        return res.status(500).json({
          error: 'Failed to fetch ventures',
          message: error.message
        });
      }

      return res.status(200).json(ventures || []);
    } catch (error) {
      console.error('Fetch ventures error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // POST: Create new venture
  if (req.method === 'POST') {
    if (!hasPermission(role, 'ventures:create')) {
      console.warn(`AUTHZ DENIED: User ${user.id} (role: ${role}) attempted ventures:create`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to create ventures. Required role: editor or admin.',
        code: 'PERMISSION_DENIED'
      });
    }

    // Validate request body
    const parsed = CreateVentureSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors
      });
    }

    const { name, problem_statement, solution, target_market, origin_type, competitor_ref, blueprint_id } = parsed.data;

    try {
      const { data: venture, error } = await supabase
        .from('ventures')
        .insert({
          name,
          problem_statement,
          // IDEATION-GENESIS-AUDIT: Capture immutable Chairman vision
          raw_chairman_intent: problem_statement,  // Lock original intent
          problem_statement_locked_at: new Date().toISOString(),
          solution,
          target_market,
          stage: 1,
          origin_type,
          competitor_ref: competitor_ref || null,
          blueprint_id: blueprint_id || null,
          // SECURITY: Associate venture with authenticated user
          user_id: user.id
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to create venture:', error);
        return res.status(500).json({
          error: 'Failed to create venture',
          message: error.message
        });
      }

      return res.status(201).json(venture);

    } catch (error) {
      console.error('Create venture error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Method not allowed
  return res.status(405).json({
    error: 'Method not allowed',
    allowed: ['GET', 'POST']
  });
}

// SECURITY: Wrap handler with authentication middleware
export default withAuth(handler);
