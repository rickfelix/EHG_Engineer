/**
 * Stage 23 Analysis Step - Launch Execution (LAUNCH & LEARN)
 * Phase: LAUNCH & LEARN (Stages 23-25)
 * Part of SD-EVA-FEAT-TEMPLATES-LAUNCH-001
 *
 * Consumes Stage 22 release readiness data and generates a launch brief
 * with success criteria as a contract with Stage 24.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-23-launch-execution
 */


// NOTE: These constants intentionally duplicated from stage-23.js
// to avoid circular dependency — stage-23.js imports analyzeStage23 from this file,
// and SYSTEM_PROMPT uses these constants at module-level evaluation.
const GO_DECISIONS = ['go', 'no-go', 'conditional_go'];
const LAUNCH_TYPES = ['soft_launch', 'beta', 'general_availability'];
const TASK_STATUSES = ['pending', 'in_progress', 'done', 'blocked'];
const CRITERION_PRIORITIES = ['primary', 'secondary'];

// SD-MAN-INFRA-VISION-HEAL-PLATFORM-001-19: Publish pipeline constants
const APP_STORE_STATUSES = ['not_submitted', 'submitted', 'in_review', 'approved', 'rejected', 'live'];
const DOMAIN_STATUSES = ['not_configured', 'dns_pending', 'ssl_pending', 'active', 'error'];
const CHANNEL_STATUSES = ['not_started', 'drafting', 'scheduled', 'live', 'paused'];

// SD-MAN-INFRA-VISION-HEAL-PLATFORM-001-22: App rankings pipeline constants
const APP_RANKING_TIERS = ['top10', 'top50', 'top100', 'below100', 'unknown'];
const COMPETITIVE_POSITIONS = ['leader', 'challenger', 'follower', 'niche', 'unknown'];

/**
 * Generate launch execution brief from Stage 22 release readiness data.
 *
 * @param {Object} params
 * @param {Object} params.stage22Data - Release readiness (releaseDecision, releaseItems, etc.)
 * @param {Object} [params.stage01Data] - Venture hydration (successCriteria from Stage 1)
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Launch brief with success criteria and tasks
 */
export async function analyzeStage23({ stage22Data, stage01Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage23] Starting analysis', { ventureName });
  if (!stage22Data) {
    throw new Error('Stage 23 launch execution requires Stage 22 (release readiness) data');
  }

  throw new Error(
    `[Stage23] REFUSED: No real build data found for venture ${ventureName || 'unknown'}. ` +
    'LLM synthesis is disabled — this stage requires real data from upstream SD completion. ' +
    'Check that the venture-to-LEO bridge created SDs and BUILD_PENDING blocked until they completed.'
  );
}


export { LAUNCH_TYPES, TASK_STATUSES, CRITERION_PRIORITIES, APP_STORE_STATUSES, DOMAIN_STATUSES, CHANNEL_STATUSES, APP_RANKING_TIERS, COMPETITIVE_POSITIONS };
