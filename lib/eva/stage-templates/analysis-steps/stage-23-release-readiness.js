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

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
// evaluatePromotionGate is a function declaration (hoisted), safe from TDZ in circular import
import { evaluatePromotionGate } from '../stage-22.js';

// NOTE: These constants intentionally duplicated from stage-22.js
// to avoid circular dependency — stage-22.js imports analyzeStage22 from this file,
// and SYSTEM_PROMPT uses these constants at module-level evaluation.
const RELEASE_DECISIONS = ['release', 'hold', 'cancel'];
const RELEASE_CATEGORIES = ['feature', 'bugfix', 'infrastructure', 'documentation', 'security', 'performance', 'configuration'];
const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];

const SYSTEM_PROMPT = `You are EVA's Release Readiness Analyst. Synthesize the entire BUILD LOOP (Stages 17-21) into a release decision, sprint retrospective, and sprint summary.

You MUST output valid JSON with exactly this structure:
{
  "releaseItems": [
    {
      "name": "Release item name",
      "category": "feature|bugfix|infrastructure|documentation|security|performance|configuration",
      "status": "pending|approved|rejected",
      "approver": "Role or name of approver"
    }
  ],
  "releaseNotes": "Markdown-formatted release notes summarizing what was built",
  "targetDate": "YYYY-MM-DD target release date",
  "releaseDecision": {
    "decision": "release|hold|cancel",
    "rationale": "2-3 sentence justification for the release decision",
    "approver": "Role making the release decision"
  },
  "sprintRetrospective": {
    "wentWell": ["What went well during the build sprint"],
    "wentPoorly": ["What could be improved"],
    "actionItems": ["Specific action for next sprint"]
  },
  "sprintSummary": {
    "sprintGoal": "The original sprint goal",
    "itemsPlanned": 5,
    "itemsCompleted": 4,
    "qualityAssessment": "Brief quality summary",
    "integrationStatus": "Brief integration summary"
  }
}

Rules:
- At least 1 release item required
- releaseNotes should be at least 10 characters, summarizing the build sprint output
- releaseDecision.decision: "release" if quality and review both pass, "hold" if conditional, "cancel" if rejected
- sprintRetrospective should have at least 1 item in each array
- sprintSummary should reflect actual data from stages 18-21
- targetDate should be reasonable (within 1-4 weeks for most ventures)`;

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

  logger.log('[Stage22] No real data found, using LLM synthesis');
  const client = getLLMClient({ purpose: 'content-generation' });

  const qaContext = stage20Data.qualityDecision
    ? `QA: ${stage20Data.qualityDecision.decision} (${stage20Data.overall_pass_rate}% pass, ${stage20Data.coverage_pct}% coverage)`
    : '';

  const reviewContext = stage21Data.reviewDecision
    ? `Review: ${stage21Data.reviewDecision.decision} (${stage21Data.passing_integrations}/${stage21Data.total_integrations} integrations)`
    : '';

  const sprintContext = stage18Data?.sprint_goal
    ? `Sprint Goal: ${stage18Data.sprint_goal}, Items: ${stage18Data.total_items || 0}`
    : '';

  const executionContext = stage19Data
    ? `Execution: ${stage19Data.completed_tasks}/${stage19Data.total_tasks} tasks, ${stage19Data.issues?.length || 0} open issues`
    : '';

  const readinessContext = stage17Data?.buildReadiness
    ? `Build Readiness: ${stage17Data.buildReadiness.decision}`
    : '';

  const userPrompt = `Generate release readiness assessment for this venture's BUILD LOOP.

Venture: ${ventureName || 'Unnamed'}
${readinessContext}
${sprintContext}
${executionContext}
${qaContext}
${reviewContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize release items
  let releaseItems = Array.isArray(parsed.releaseItems)
    ? parsed.releaseItems.filter(ri => ri?.name)
    : [];

  if (releaseItems.length === 0) {
    releaseItems = [{
      name: 'Sprint Deliverable',
      category: 'feature',
      status: 'pending',
      approver: 'Product Owner',
    }];
  } else {
    releaseItems = releaseItems.map(ri => ({
      name: String(ri.name).substring(0, 200),
      category: RELEASE_CATEGORIES.includes(ri.category) ? ri.category : 'feature',
      status: ['pending', 'approved', 'rejected'].includes(ri.status) ? ri.status : 'pending',
      approver: String(ri.approver || 'Unassigned').substring(0, 200),
    }));
  }

  // Normalize release notes
  const releaseNotes = String(parsed.releaseNotes || 'Build sprint completed.').substring(0, 2000);

  // Normalize target date
  const targetDate = parsed.targetDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.targetDate)
    ? parsed.targetDate
    : new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

  // Normalize release decision
  const rd = parsed.releaseDecision || {};
  const qaPass = stage20Data.qualityDecision?.decision === 'pass' || stage20Data.qualityDecision?.decision === 'conditional_pass';
  const reviewPass = stage21Data.reviewDecision?.decision === 'approve' || stage21Data.reviewDecision?.decision === 'conditional';

  let decision;
  if (RELEASE_DECISIONS.includes(rd.decision)) {
    decision = rd.decision;
  } else if (qaPass && reviewPass) {
    decision = 'release';
  } else if (qaPass || reviewPass) {
    decision = 'hold';
  } else {
    decision = 'cancel';
  }

  const releaseDecision = {
    decision,
    rationale: String(rd.rationale || `Release ${decision} based on QA and review results`).substring(0, 500),
    approver: String(rd.approver || 'Product Owner').substring(0, 200),
  };

  // Normalize sprint retrospective
  const retro = parsed.sprintRetrospective || {};
  const sprintRetrospective = {
    wentWell: Array.isArray(retro.wentWell) && retro.wentWell.length > 0
      ? retro.wentWell.map(w => String(w).substring(0, 300))
      : ['Sprint completed on schedule'],
    wentPoorly: Array.isArray(retro.wentPoorly) && retro.wentPoorly.length > 0
      ? retro.wentPoorly.map(w => String(w).substring(0, 300))
      : ['Areas for improvement identified'],
    actionItems: Array.isArray(retro.actionItems) && retro.actionItems.length > 0
      ? retro.actionItems.map(a => String(a).substring(0, 300))
      : ['Review sprint metrics in next planning'],
  };

  // Normalize sprint summary (use snake_case upstream refs from fixed stages 18-21)
  const ss = parsed.sprintSummary || {};
  const sprintSummary = {
    sprintGoal: String(ss.sprintGoal || stage18Data?.sprint_goal || 'Sprint goal').substring(0, 300),
    itemsPlanned: typeof ss.itemsPlanned === 'number' ? ss.itemsPlanned : (stage18Data?.total_items || 0),
    itemsCompleted: typeof ss.itemsCompleted === 'number' ? ss.itemsCompleted : (stage19Data?.completed_tasks || 0),
    qualityAssessment: String(ss.qualityAssessment || `${stage20Data.overall_pass_rate || 0}% pass rate`).substring(0, 300),
    integrationStatus: String(ss.integrationStatus || `${stage21Data.passing_integrations || 0}/${stage21Data.total_integrations || 0} passing`).substring(0, 300),
  };

  // Transform to template schema field names (snake_case)
  const release_items = releaseItems.map(ri => ({
    name: ri.name,
    category: ri.category,
    status: ri.status,
    approver: ri.approver,
  }));
  const release_notes = releaseNotes;
  const target_date = targetDate;
  const total_items = release_items.length;
  const approved_items = release_items.filter(ri => ri.status === 'approved').length;
  const all_approved = total_items > 0 && release_items.every(ri => ri.status === 'approved');

  // Evaluate Phase 5→6 Promotion Gate (rescued from dead computeDerived)
  const stage22Output = { release_items, releaseDecision, all_approved };
  const promotion_gate = evaluatePromotionGate({
    stage17: stage17Data,
    stage18: stage18Data,
    stage19: stage19Data,
    stage20: stage20Data,
    stage21: stage21Data,
    stage22: stage22Output,
  });

  // Track LLM fallback fields
  let llmFallbackCount = 0;
  if (!Array.isArray(parsed.releaseItems) || parsed.releaseItems.length === 0) llmFallbackCount++;
  for (const ri of parsed.releaseItems || []) {
    if (!RELEASE_CATEGORIES.includes(ri?.category)) llmFallbackCount++;
    if (!APPROVAL_STATUSES.includes(ri?.status)) llmFallbackCount++;
  }
  if (!RELEASE_DECISIONS.includes(rd.decision)) llmFallbackCount++;
  if (!parsed.releaseNotes || parsed.releaseNotes.length < 10) llmFallbackCount++;
  if (!parsed.targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.targetDate)) llmFallbackCount++;
  if (llmFallbackCount > 0) {
    logger.warn('[Stage22] LLM fallback fields detected', { llmFallbackCount });
  }

  logger.log('[Stage22] Analysis complete', { duration: Date.now() - startTime });
  return {
    release_items,
    release_notes,
    target_date,
    releaseDecision,
    sprintRetrospective,
    sprintSummary,
    total_items,
    approved_items,
    all_approved,
    promotion_gate,
    llmFallbackCount,
    fourBuckets, usage,
  };
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
