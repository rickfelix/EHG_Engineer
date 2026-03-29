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
 * @param {Object} params.stage18Data - Build readiness (lifecycle 18)
 * @param {Object} params.stage19Data - Sprint plan (lifecycle 19)
 * @param {Object} params.stage20Data - Build execution (lifecycle 20)
 * @param {Object} params.stage21Data - QA assessment (lifecycle 21)
 * @param {Object} params.stage22Data - Build review (lifecycle 22)
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Release readiness with decision, retro, and summary
 */
export async function analyzeStage22({ stage18Data, stage19Data, stage20Data, stage21Data, stage22Data, ventureName, supabase, ventureId, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage22] Starting analysis', { ventureName });
  if (!stage21Data || !stage22Data) {
    throw new Error('Stage 23 release readiness requires Stage 21 (QA) and Stage 22 (review) data');
  }

  // Use real data path if all upstream stages used real data
  if (stage20Data?.dataSource === 'venture_stage_work' &&
      stage21Data?.dataSource === 'venture_stage_work' &&
      stage22Data?.dataSource === 'venture_stage_work') {
    try {
      const realData = buildRealReleaseData(stage18Data, stage19Data, stage20Data, stage21Data, stage22Data, logger);
      if (realData) {
        // Still evaluate promotion gate (non-LLM, algorithmic)
        // evaluatePromotionGate uses legacy param names (stage17=build readiness, etc.)
        // Map lifecycle stage numbers to those legacy names
        const promotion_gate = evaluatePromotionGate({
          stage17: stage18Data,
          stage18: stage19Data,
          stage19: stage20Data,
          stage20: stage21Data,
          stage21: stage22Data,
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
 * @param {Object} stage18Data - Build readiness (lifecycle 18)
 * @param {Object} stage19Data - Sprint plan (lifecycle 19)
 * @param {Object} stage20Data - Build execution (lifecycle 20, real data)
 * @param {Object} stage21Data - QA (lifecycle 21, real data)
 * @param {Object} stage22Data - Build review (lifecycle 22, real data)
 * @param {Object} logger
 * @returns {Object|null} Stage 23 output or null if data insufficient
 */
function buildRealReleaseData(stage18Data, stage19Data, stage20Data, stage21Data, stage22Data, logger) {
  const tasks = stage20Data.tasks || [];
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
  const qaPass = stage21Data.qualityDecision?.decision === 'pass' || stage21Data.qualityDecision?.decision === 'conditional_pass';
  const reviewPass = stage22Data.reviewDecision?.decision === 'approve' || stage22Data.reviewDecision?.decision === 'conditional';

  let decision;
  if (qaPass && reviewPass && all_approved) {
    decision = 'release';
  } else if (qaPass || reviewPass) {
    decision = 'hold';
  } else {
    decision = 'cancel';
  }

  const completedTasks = stage20Data.completed_tasks || 0;
  const totalTasks = stage20Data.total_tasks || 0;
  const passRate = stage21Data.overall_pass_rate || 0;

  const release_notes = `Real data release: ${completedTasks}/${totalTasks} tasks completed, ${passRate}% QA pass rate, review: ${stage22Data.reviewDecision?.decision}`;
  const target_date = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  // Sprint retrospective from real metrics
  const sprintRetrospective = {
    wentWell: completedTasks > 0
      ? [`${completedTasks} of ${totalTasks} tasks completed successfully`]
      : ['Sprint initiated'],
    wentPoorly: stage20Data.blocked_tasks > 0
      ? [`${stage20Data.blocked_tasks} task(s) blocked during sprint`]
      : ['No major issues identified'],
    actionItems: decision !== 'release'
      ? ['Resolve remaining blockers before next sprint']
      : ['Maintain current velocity in next sprint'],
  };

  // Sprint summary from real data
  const sprintSummary = {
    sprintGoal: stage19Data?.sprint_goal || 'Build sprint',
    itemsPlanned: totalTasks,
    itemsCompleted: completedTasks,
    qualityAssessment: `${passRate}% pass rate, ${stage21Data.coverage_pct || 0}% coverage`,
    integrationStatus: `${stage22Data.passing_integrations || 0}/${stage22Data.total_integrations || 0} integrations passing`,
  };

  logger.log('[Stage23] Built real release data', { decision, total_items, approved_items });

  return {
    release_items: allItems,
    release_notes,
    target_date,
    releaseDecision: {
      decision,
      rationale: `Real data: QA ${stage21Data.qualityDecision?.decision}, Review ${stage22Data.reviewDecision?.decision}, ${approved_items}/${total_items} items approved`,
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
