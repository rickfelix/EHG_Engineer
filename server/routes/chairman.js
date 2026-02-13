/**
 * Chairman Decision API Routes
 * SD-EVA-FEAT-DFE-PRESENTATION-001
 *
 * Provides DFE escalation context and mitigation action endpoints
 * for the Chairman Dashboard's EscalationPanel.
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/middleware/eva-error-handler.js';
import { DfeEscalationService } from '../../lib/services/dfe-escalation-service.js';

const router = Router();

/**
 * GET /api/chairman/decisions/:decisionId/dfe-escalation
 *
 * Returns the normalized DFE escalation context for a decision,
 * including triggers, historical patterns, and recent events.
 */
router.get('/decisions/:decisionId/dfe-escalation', asyncHandler(async (req, res) => {
  const { decisionId } = req.params;

  if (!decisionId) {
    return res.status(400).json({ success: false, error: 'decisionId is required' });
  }

  const service = new DfeEscalationService();
  const result = await service.getEscalationContext(decisionId);

  if (!result.success) {
    return res.status(404).json(result);
  }

  res.json(result);
}));

/**
 * POST /api/chairman/decisions/:decisionId/dfe-escalation/mitigate
 *
 * Record an accept/reject action on a specific mitigation trigger.
 * Idempotent per (decisionId, mitigationId, action, idempotencyKey).
 *
 * Body: { mitigationId, action: 'accept'|'reject', reason?, idempotencyKey? }
 */
router.post('/decisions/:decisionId/dfe-escalation/mitigate', asyncHandler(async (req, res) => {
  const { decisionId } = req.params;
  const { mitigationId, action, reason, idempotencyKey } = req.body;

  if (!decisionId || !mitigationId || !action) {
    return res.status(400).json({
      success: false,
      error: 'decisionId, mitigationId, and action are required',
    });
  }

  if (!['accept', 'reject'].includes(action)) {
    return res.status(400).json({
      success: false,
      error: 'action must be "accept" or "reject"',
    });
  }

  const service = new DfeEscalationService();
  const result = await service.recordMitigationAction({
    decisionId,
    mitigationId,
    action,
    reason,
    idempotencyKey,
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
}));

export default router;
