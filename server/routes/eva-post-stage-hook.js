/**
 * EVA Post-Stage Hook API Route
 *
 * SD: SD-MAN-ORCH-CLI-FRONTEND-PIPELINE-001-C
 *
 * POST /api/eva/post-stage-hook
 * Dispatches to S15 stitch-provisioner, S17 doc-gen, S19 lifecycle-sd-bridge.
 * Service-role auth only. Returns 202 Accepted immediately (non-blocking).
 *
 * @module server/routes/eva-post-stage-hook
 */

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

const router = Router();

// Stage-to-handler mapping
const HOOK_STAGES = new Set([15, 17, 19]);

/**
 * Service-role auth middleware.
 * Validates Authorization: Bearer <service_role_key> against SUPABASE_SERVICE_ROLE_KEY.
 */
function requireServiceRole(req, res, next) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'Service role key not configured',
      code: 'CONFIG_ERROR'
    });
  }

  const authHeader = req.headers.authorization;
  const internalKey = req.headers['x-internal-api-key'];

  // Accept X-Internal-API-Key as alternative (timing-safe)
  if (internalKey && process.env.INTERNAL_API_KEY) {
    try {
      if (internalKey.length === process.env.INTERNAL_API_KEY.length &&
          timingSafeEqual(Buffer.from(internalKey), Buffer.from(process.env.INTERNAL_API_KEY))) {
        return next();
      }
    } catch { /* fall through */ }
  }

  // Accept Bearer <service_role_key>
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
      code: 'NO_AUTH_HEADER'
    });
  }

  const token = authHeader.substring(7);
  try {
    if (token.length !== serviceRoleKey.length ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(serviceRoleKey))) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid service role key',
        code: 'INVALID_SERVICE_KEY'
      });
    }
  } catch {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid service role key',
      code: 'INVALID_SERVICE_KEY'
    });
  }

  next();
}

/**
 * Create a service-role Supabase client for dispatchers that need it.
 */
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key);
}

/**
 * Dispatch to S15 stitch-provisioner.
 */
async function dispatchS15(context) {
  const { provisionStitchProject } = await import('../../lib/eva/bridge/stitch-provisioner.js');
  const { venture_id, stage_context } = context;
  return provisionStitchProject(
    venture_id,
    stage_context?.stage_11_artifacts || {},
    stage_context?.stage_15_artifacts || {},
    { source: 'post-stage-hook' }
  );
}

/**
 * Dispatch to S17 doc-gen.
 */
async function dispatchS17(context) {
  const { generateDocs } = await import('../../lib/eva/stage-templates/analysis-steps/stage-17-doc-generation.js');
  const supabase = getServiceClient();
  return generateDocs({
    ventureId: context.venture_id,
    ventureName: context.stage_context?.venture_name || context.venture_id,
    supabase,
    logger: console
  });
}

/**
 * Dispatch to S19 lifecycle-sd-bridge.
 */
async function dispatchS19(context) {
  const { convertSprintToSDs } = await import('../../lib/eva/lifecycle-sd-bridge.js');
  const supabase = getServiceClient();
  return convertSprintToSDs(
    {
      stageOutput: context.stage_context?.stage_output || {},
      ventureContext: { venture_id: context.venture_id },
      options: { source: 'post-stage-hook' }
    },
    { supabase, logger: console }
  );
}

const DISPATCHERS = {
  15: dispatchS15,
  17: dispatchS17,
  19: dispatchS19
};

/**
 * POST /api/eva/post-stage-hook
 *
 * Body: { venture_id: string, stage_number: number, stage_context?: object }
 * Returns: 202 Accepted
 */
router.post('/', requireServiceRole, (req, res) => {
  const { venture_id, stage_number, stage_context } = req.body;

  // Validate required fields
  if (!venture_id || typeof venture_id !== 'string') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'venture_id is required and must be a string',
      code: 'MISSING_VENTURE_ID'
    });
  }

  if (stage_number == null || typeof stage_number !== 'number' || !Number.isInteger(stage_number)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'stage_number is required and must be an integer',
      code: 'MISSING_STAGE_NUMBER'
    });
  }

  // Return 202 immediately
  res.status(202).json({
    status: 'accepted',
    venture_id,
    stage_number,
    has_handler: HOOK_STAGES.has(stage_number)
  });

  // Fire-and-forget dispatch
  const dispatcher = DISPATCHERS[stage_number];
  if (!dispatcher) {
    console.warn(`[post-stage-hook] No handler for stage ${stage_number} (venture: ${venture_id})`);
    return;
  }

  const context = { venture_id, stage_number, stage_context: stage_context || {} };

  dispatcher(context)
    .then(result => {
      console.log(`[post-stage-hook] S${stage_number} dispatch success (venture: ${venture_id})`,
        typeof result === 'object' ? { status: result?.status } : result);
    })
    .catch(err => {
      console.error(`[post-stage-hook] S${stage_number} dispatch failed (venture: ${venture_id}):`, err.message);
    });
});

export default router;
