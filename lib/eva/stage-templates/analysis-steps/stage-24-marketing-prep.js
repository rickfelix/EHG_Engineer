/**
 * Stage 23 Analysis Step - Marketing Preparation
 * Phase: LAUNCH & LEARN (Stages 23-25)
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-B
 *
 * Consumes Stage 22 release readiness data, generates marketing item
 * payloads via LLM, and creates real marketing SDs via lifecycle-sd-bridge.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-23-marketing-prep
 */

import { checkReleaseReadiness } from '../stage-24.js';

// Duplicated from stage-23.js to avoid circular dependency at module-level eval
const MARKETING_ITEM_TYPES = [
  'landing_page', 'social_media_campaign', 'press_release',
  'email_campaign', 'content_blog', 'video_promo', 'ad_creative',
  'product_demo', 'case_study', 'launch_announcement',
];
const MARKETING_PRIORITIES = ['critical', 'high', 'medium', 'low'];

/**
 * Generate marketing preparation items from Stage 22 release readiness data.
 *
 * @param {Object} params
 * @param {Object} params.stage23Data - Release readiness (lifecycle 23: releaseDecision, releaseItems, etc.)
 * @param {Object} [params.stage01Data] - Venture hydration (for product context)
 * @param {Object} [params.stage10Data] - Naming/branding data
 * @param {Object} [params.stage11Data] - GTM strategy data
 * @param {string} [params.ventureName]
 * @param {Object} [params.logger]
 * @returns {Promise<Object>} Marketing items with SD bridge payloads
 */
export async function analyzeStage23({ stage23Data, stage01Data, stage10Data, stage11Data, ventureName, ventureId, supabase, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage23] Starting marketing preparation analysis', { ventureName });

  // Check Stage 23 prerequisite (release readiness)
  const readiness = checkReleaseReadiness({ stage23Data });
  if (!readiness.ready) {
    // L2+ autonomy: auto-proceed despite release readiness not met
    let autonomyOverride = false;
    if (ventureId && supabase) {
      try {
        const { checkAutonomy } = await import('../../autonomy-model.js');
        const autonomy = await checkAutonomy(ventureId, 'stage_gate', { supabase });
        if (autonomy.action === 'auto_approve') {
          logger.log(`[Stage23] Release readiness not met but autonomy=${autonomy.level} — auto-proceeding`);
          autonomyOverride = true;
        }
      } catch { /* fall through to throw */ }
    }
    if (!autonomyOverride) {
      const errorMsg = `Stage 22 release readiness required: ${readiness.reasons.join('; ')}`;
      logger.warn(`[Stage23] ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  throw new Error(
    `[Stage24] REFUSED: No real build data found for venture ${ventureId || 'unknown'}. ` +
    'LLM synthesis is disabled — this stage requires real data from upstream SD completion. ' +
    'Check that the venture-to-LEO bridge created SDs and BUILD_PENDING blocked until they completed.'
  );
}
