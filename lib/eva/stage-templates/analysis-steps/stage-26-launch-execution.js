/**
 * Stage 25 Analysis Step - Launch Execution (Pipeline Terminus)
 * Phase: LAUNCH & LEARN (Stages 23-25)
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-B
 *
 * Verifies Stage 24 chairman approval, activates distribution channels,
 * generates operations handoff, and marks pipeline terminus.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-25-launch-execution
 */

import { verifyLaunchAuthorization } from '../stage-26.js';

/**
 * Generate launch execution plan from Stage 24 approval data.
 *
 * @param {Object} params
 * @param {Object} params.stage25Data - Launch readiness (lifecycle 25: chairman gate, readiness checklist)
 * @param {Object} [params.stage23Data] - Release readiness data (lifecycle 23)
 * @param {Object} [params.stage24Data] - Marketing preparation data (lifecycle 24)
 * @param {Object} [params.stage01Data] - Venture hydration data
 * @param {string} [params.ventureName]
 * @param {Object} [params.logger]
 * @returns {Promise<Object>} Launch execution with distribution channels and operations handoff
 */
export async function analyzeStage25({ stage25Data, stage23Data, stage24Data, ventureName, ventureId, supabase, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage25] Starting launch execution analysis', { ventureName });

  // Verify Stage 25 chairman approval
  const auth = verifyLaunchAuthorization({ stage25Data });
  if (!auth.authorized) {
    // L2+ autonomy: auto-proceed despite launch not authorized
    let autonomyOverride = false;
    if (ventureId && supabase) {
      try {
        const { checkAutonomy } = await import('../../autonomy-model.js');
        const autonomy = await checkAutonomy(ventureId, 'stage_gate', { supabase });
        if (autonomy.action === 'auto_approve') {
          logger.log(`[Stage25] Launch not authorized but autonomy=${autonomy.level} — auto-proceeding`);
          autonomyOverride = true;
        }
      } catch { /* fall through to throw */ }
    }
    if (!autonomyOverride) {
      const errorMsg = `Launch not authorized: ${auth.reasons.join('; ')}`;
      logger.warn(`[Stage25] ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  throw new Error(
    `[Stage26] REFUSED: No real build data found for venture ${ventureName || 'unknown'}. ` +
    'LLM synthesis is disabled — this stage requires real data from upstream SD completion. ' +
    'Check that the venture-to-LEO bridge created SDs and BUILD_PENDING blocked until they completed.'
  );
}
