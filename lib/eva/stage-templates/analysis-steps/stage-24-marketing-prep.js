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

  // Use real data path if upstream stage used real data
  if (stage23Data?.dataSource === 'venture_stage_work') {
    try {
      const realData = buildRealMarketingData(stage23Data, stage01Data, ventureName, logger);
      if (realData) {
        logger.log('[Stage24] Using real data from upstream stages');
        return realData;
      }
    } catch (err) {
      logger.warn('[Stage24] Real data derivation failed', { error: err.message });
    }
  }

  throw new Error(
    `[Stage24] REFUSED: No real build data found for venture ${ventureId || 'unknown'}. ` +
    'LLM synthesis is disabled — this stage requires real data from upstream SD completion. ' +
    'Check that the venture-to-LEO bridge created SDs and BUILD_PENDING blocked until they completed.'
  );
}

/**
 * Build marketing preparation data from real upstream stage data (no LLM).
 * Derives marketing items algorithmically from release items in stage 23.
 *
 * @param {Object} stage23Data - Release readiness (lifecycle 23)
 * @param {Object} [stage01Data] - Idea brief (lifecycle 1)
 * @param {string} [ventureName]
 * @param {Object} logger
 * @returns {Object|null} Stage 24 output or null if data insufficient
 */
function buildRealMarketingData(stage23Data, stage01Data, ventureName, logger) {
  const releaseItems = stage23Data.release_items || [];
  const approvedItems = releaseItems.filter(ri => ri.status === 'approved');
  if (approvedItems.length === 0) return null;

  // Map release items to marketing items
  const typeRotation = ['launch_announcement', 'content_blog', 'product_demo', 'social_media_campaign', 'email_campaign'];
  const marketing_items = approvedItems.map((ri, idx) => ({
    title: idx === 0 ? `Launch Announcement: ${ri.name}` : `${ri.name} — ${typeRotation[idx % typeRotation.length].replace(/_/g, ' ')}`,
    description: `Marketing deliverable for ${ri.name} (${ri.category || 'feature'})`,
    type: typeRotation[idx % typeRotation.length],
    priority: idx === 0 ? 'critical' : idx < 3 ? 'high' : 'medium',
  }));

  // Ensure minimum 3 items
  const fillerTypes = ['case_study', 'press_release', 'ad_creative'];
  while (marketing_items.length < 3) {
    const fillerIdx = marketing_items.length - approvedItems.length;
    marketing_items.push({
      title: `${ventureName || 'Venture'} ${fillerTypes[fillerIdx] || 'press_release'} asset`.replace(/_/g, ' '),
      description: `Supporting marketing asset for ${ventureName || 'venture'} launch`,
      type: fillerTypes[fillerIdx] || 'press_release',
      priority: 'medium',
    });
  }

  const name = ventureName || 'Venture';
  const ideaBrief = stage01Data?.idea_brief || stage01Data?.ideaBrief || '';
  const summary = ideaBrief
    ? `${name} launch marketing strategy based on: ${ideaBrief.slice(0, 200)}`
    : `${name} launch marketing strategy covering ${marketing_items.length} deliverables across ${approvedItems.length} approved release items`;

  const readinessPct = Math.round((approvedItems.length / releaseItems.length) * 100);

  logger.log('[Stage24] Built real marketing data', { items: marketing_items.length, readinessPct });

  return {
    marketing_items,
    sd_bridge_payloads: [],
    marketing_sds: [],
    marketing_strategy_summary: summary,
    target_audience: `${name} target users and stakeholders`,
    marketing_readiness_pct: readinessPct,
    total_marketing_items: marketing_items.length,
    sds_created_count: 0,
    dataSource: 'venture_stage_work',
  };
}
