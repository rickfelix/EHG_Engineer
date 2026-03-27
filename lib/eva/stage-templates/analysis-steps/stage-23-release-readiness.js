/**
 * Stage 22 Analysis Step - Release Readiness (BUILD LOOP Closeout)
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-EVA-FEAT-TEMPLATES-BUILDLOOP-001
 *
 * Consumes Stages 17-21 data and generates release decision,
 * sprint retrospective, sprint summary, and Phase 5→6 Promotion Gate evaluation.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-22-release-readiness
 */

// evaluatePromotionGate is a function declaration (hoisted), safe from TDZ in circular import
import { evaluatePromotionGate } from '../stage-23.js';

// NOTE: These constants intentionally duplicated from stage-22.js
// to avoid circular dependency — stage-22.js imports analyzeStage22 from this file,
// and SYSTEM_PROMPT uses these constants at module-level evaluation.
const RELEASE_DECISIONS = ['release', 'hold', 'cancel'];
const RELEASE_CATEGORIES = ['feature', 'bugfix', 'infrastructure', 'documentation', 'security', 'performance', 'configuration'];

/**
 * Generate release readiness assessment from BUILD LOOP data.
 *
 * @param {Object} params
 * @param {Object} params.stage17Data - Build readiness
 * @param {Object} params.stage18Data - Sprint plan
 * @param {Object} params.stage19Data - Build execution
 * @param {Object} params.stage20Data - QA assessment
 * @param {Object} params.stage21Data - Build review
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Release readiness with decision, retro, and summary
 */
export async function analyzeStage22({ stage17Data, stage18Data, stage19Data, stage20Data, stage21Data, ventureName, supabase, ventureId, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage22] Starting analysis', { ventureName });
  if (!stage20Data || !stage21Data) {
    throw new Error('Stage 22 release readiness requires Stage 20 (QA) and Stage 21 (review) data');
  }

  // Use real data path if all upstream stages used real data
  if (stage19Data?.dataSource === 'venture_stage_work' &&
      stage20Data?.dataSource === 'venture_stage_work' &&
      stage21Data?.dataSource === 'venture_stage_work') {
    try {
      const realData = buildRealReleaseData(stage17Data, stage18Data, stage19Data, stage20Data, stage21Data, logger);
      if (realData) {
        // Still evaluate promotion gate (non-LLM, algorithmic)
        const promotion_gate = evaluatePromotionGate({
          stage17: stage17Data,
          stage18: stage18Data,
          stage19: stage19Data,
          stage20: stage20Data,
          stage21: stage21Data,
          stage22: realData,
        });
        realData.promotion_gate = promotion_gate;
        logger.log('[Stage22] Using real release data from upstream stages');
        return realData;
      }
    } catch (err) {
      logger.warn('[Stage22] Real data derivation failed, falling back to LLM', { error: err.message });
    }
  }

  throw new Error(
    `[Stage22] REFUSED: No real build data found for venture ${ventureId || 'unknown'}. ` +
    'LLM synthesis is disabled — this stage requires real data from upstream SD completion. ' +
    'Check that the venture-to-LEO bridge created SDs and BUILD_PENDING blocked until they completed.'
  );
}


/**
 * Build release readiness data from real upstream stage data (no LLM).
 * Derives release items from completed tasks, computes algorithmic release decision.
 *
 * @param {Object} stage17Data - Build readiness
 * @param {Object} stage18Data - Sprint plan
 * @param {Object} stage19Data - Build execution (real data)
 * @param {Object} stage20Data - QA (real data)
 * @param {Object} stage21Data - Build review (real data)
 * @param {Object} logger
 * @returns {Object|null} Stage 22 output or null if data insufficient
 */
function buildRealReleaseData(stage17Data, stage18Data, stage19Data, stage20Data, stage21Data, logger) {
  const tasks = stage19Data.tasks || [];
  if (tasks.length === 0) return null;

  // Build release items from completed tasks
  const release_items = tasks
    .filter(t => t.status === 'done')
    .map(t => ({
      name: t.name,
      category: 'feature',
      status: 'approved',
      approver: 'leo-protocol',
    }));

  // Add pending items for incomplete tasks
  const pendingItems = tasks
    .filter(t => t.status !== 'done')
    .map(t => ({
      name: t.name,
      category: 'feature',
      status: t.status === 'blocked' ? 'rejected' : 'pending',
      approver: 'leo-protocol',
    }));

  const allItems = [...release_items, ...pendingItems];
  if (allItems.length === 0) {
    allItems.push({ name: 'Sprint Deliverable', category: 'feature', status: 'pending', approver: 'leo-protocol' });
  }

  const total_items = allItems.length;
  const approved_items = allItems.filter(ri => ri.status === 'approved').length;
  const all_approved = total_items > 0 && allItems.every(ri => ri.status === 'approved');

  // Algorithmic release decision from QA + review
  const qaPass = stage20Data.qualityDecision?.decision === 'pass' || stage20Data.qualityDecision?.decision === 'conditional_pass';
  const reviewPass = stage21Data.reviewDecision?.decision === 'approve' || stage21Data.reviewDecision?.decision === 'conditional';

  let decision;
  if (qaPass && reviewPass && all_approved) {
    decision = 'release';
  } else if (qaPass || reviewPass) {
    decision = 'hold';
  } else {
    decision = 'cancel';
  }

  const completedTasks = stage19Data.completed_tasks || 0;
  const totalTasks = stage19Data.total_tasks || 0;
  const passRate = stage20Data.overall_pass_rate || 0;

  const release_notes = `Real data release: ${completedTasks}/${totalTasks} tasks completed, ${passRate}% QA pass rate, review: ${stage21Data.reviewDecision?.decision}`;
  const target_date = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  // Sprint retrospective from real metrics
  const sprintRetrospective = {
    wentWell: completedTasks > 0
      ? [`${completedTasks} of ${totalTasks} tasks completed successfully`]
      : ['Sprint initiated'],
    wentPoorly: stage19Data.blocked_tasks > 0
      ? [`${stage19Data.blocked_tasks} task(s) blocked during sprint`]
      : ['No major issues identified'],
    actionItems: decision !== 'release'
      ? ['Resolve remaining blockers before next sprint']
      : ['Maintain current velocity in next sprint'],
  };

  // Sprint summary from real data
  const sprintSummary = {
    sprintGoal: stage18Data?.sprint_goal || 'Build sprint',
    itemsPlanned: totalTasks,
    itemsCompleted: completedTasks,
    qualityAssessment: `${passRate}% pass rate, ${stage20Data.coverage_pct || 0}% coverage`,
    integrationStatus: `${stage21Data.passing_integrations || 0}/${stage21Data.total_integrations || 0} integrations passing`,
  };

  logger.log('[Stage22] Built real release data', { decision, total_items, approved_items });

  return {
    release_items: allItems,
    release_notes,
    target_date,
    releaseDecision: {
      decision,
      rationale: `Real data: QA ${stage20Data.qualityDecision?.decision}, Review ${stage21Data.reviewDecision?.decision}, ${approved_items}/${total_items} items approved`,
      approver: 'leo-protocol',
    },
    sprintRetrospective,
    sprintSummary,
    total_items,
    approved_items,
    all_approved,
    llmFallbackCount: 0,
    fourBuckets: null,
    usage: null,
    dataSource: 'venture_stage_work',
  };
}


export { RELEASE_DECISIONS, RELEASE_CATEGORIES };
