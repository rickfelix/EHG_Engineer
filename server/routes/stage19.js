/**
 * Stage 19 Replit Workflow API Routes
 *
 * Path: /api/stage19
 *
 * Endpoints:
 *   GET /:ventureId/replit-prompts — returns Plan Mode + per-feature prompts
 *                                    grounded in S18 marketing copy + S17 designs
 *
 * Architectural rationale (2026-04-28):
 * Before this route existed, the Stage 19 frontend (`BuildMethodSelector.tsx`)
 * built Replit prompts entirely client-side — duplicating logic that
 * `lib/eva/bridge/replit-format-strategies.js` already implemented. Two
 * implementations drifted: backend got the marketing-copy binding fix from
 * §0 Rule 7 of the pre-approval playbook; frontend was unaware. This route
 * makes the backend the single source of truth so the frontend just renders.
 *
 * @module server/routes/stage19
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/middleware/eva-error-handler.js';
import { isValidUuid } from '../middleware/validate.js';
import { formatReplitOptimized } from '../../lib/eva/bridge/replit-prompt-formatter.js';

const router = Router();

/**
 * GET /api/stage19/:ventureId/replit-prompts
 *
 * Returns the Plan Mode prompt and per-feature prompts for a venture, ready
 * to display in Stage 19's Replit workflow UI. Both formats are grounded in
 * the chairman-approved S18 marketing copy via the `Binding contract` block
 * (per the §0 Rule 7 round-trip refinement on 2026-04-28).
 *
 * Response shape:
 * {
 *   ventureName: string,
 *   planPrompt: string,
 *   featurePrompts: [{ title, content, points, priority }],
 *   warnings?: string[],
 *   generatedAt: string,
 * }
 */
router.get('/:ventureId/replit-prompts', asyncHandler(async (req, res) => {
  const { ventureId } = req.params;
  if (!isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'Invalid ventureId format', code: 'INVALID_VENTURE_ID' });
  }

  const scope = req.query.scope === 'wireframes' ? 'wireframes' : 'sprint';

  try {
    const result = await formatReplitOptimized(ventureId, { scope });
    return res.status(200).json({
      ventureName: result.manifest?.ventureName || 'Venture',
      planPrompt: result.planModePrompt?.content || '',
      featurePrompts: (result.featurePrompts || []).map((fp) => ({
        title: fp.title || fp.filename || 'Feature',
        content: fp.content || '',
        points: fp.storyPoints ?? 0,
        priority: fp.priority || 'medium',
      })),
      warnings: result.warnings || [],
      generatedAt: result.manifest?.exportedAt || new Date().toISOString(),
    });
  } catch (err) {
    console.error('[stage19-route] replit-prompts failed', JSON.stringify({
      ventureId,
      errorName: err?.name,
      errorMessage: err?.message,
      errorCode: err?.code,
    }));
    if (err?.stack) console.error('[stage19-route] stack:', err.stack);
    return res.status(500).json({
      error: err?.message || 'Failed to build Replit prompts',
      code: 'PROMPT_BUILD_FAILED',
    });
  }
}));

export default router;
