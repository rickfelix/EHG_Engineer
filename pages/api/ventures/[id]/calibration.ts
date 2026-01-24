/**
 * GET /api/ventures/[id]/calibration
 * Operation 'Final Weld' v6.0.0: Truth Aggregator - Live δ scores
 * SD-LEO-GEN-REMEDIATE-CRITICAL-SECURITY-001: Added authentication
 * SD-SEC-AUTHORIZATION-RBAC-001: Added RBAC authorization
 *
 * Returns calibration data for a specific venture including:
 * - normalized_delta: Calibration delta normalized by vertical complexity
 * - health_status: 'green' | 'yellow' | 'red'
 * - thresholds: Vertical-specific health thresholds
 *
 * SECURITY:
 * - Authentication: Requires valid JWT token
 * - Authorization: Requires 'ventures:read' permission (viewer+)
 * - Uses user-scoped Supabase client
 */

import { NextApiResponse } from 'next';
import { CalibrationService } from '../../../../src/services/CalibrationService.js';
import { withAuth, AuthenticatedRequest } from '../../../../lib/middleware/api-auth';
import { withPermission } from '../../../../lib/middleware/rbac';

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      allowed: ['GET']
    });
  }

  const { id } = req.query;

  // Validate venture ID
  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Venture ID is required'
    });
  }

  // UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Invalid venture ID format'
    });
  }

  try {
    const calibrationService = new CalibrationService();
    const result = await calibrationService.getVentureCalibration(id);

    if (!result.success) {
      return res.status(404).json({
        error: 'Venture not found',
        message: result.error
      });
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Calibration fetch error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// SECURITY: Wrap handler with authentication and authorization middleware
// SD-SEC-AUTHORIZATION-RBAC-001: Requires ventures:read permission
export default withAuth(withPermission('ventures:read')(handler));
