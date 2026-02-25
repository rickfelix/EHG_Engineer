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

const RELEASE_DECISIONS = ['release', 'hold', 'cancel'];
const RELEASE_CATEGORIES = ['feature', 'bugfix', 'infrastructure', 'documentation', 'security', 'performance', 'configuration'];

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
export async function analyzeStage22({ stage17Data, stage18Data, stage19Data, stage20Data, stage21Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage22] Starting analysis', { ventureName });
  if (!stage20Data || !stage21Data) {
    throw new Error('Stage 22 release readiness requires Stage 20 (QA) and Stage 21 (review) data');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const qaContext = stage20Data.qualityDecision
    ? `QA: ${stage20Data.qualityDecision.decision} (${stage20Data.overallPassRate}% pass, ${stage20Data.coveragePct}% coverage)`
    : '';

  const reviewContext = stage21Data.reviewDecision
    ? `Review: ${stage21Data.reviewDecision.decision} (${stage21Data.passingIntegrations}/${stage21Data.totalIntegrations} integrations)`
    : '';

  const sprintContext = stage18Data?.sprintGoal
    ? `Sprint Goal: ${stage18Data.sprintGoal}, Items: ${stage18Data.totalItems || 0}`
    : '';

  const executionContext = stage19Data
    ? `Execution: ${stage19Data.completedTasks}/${stage19Data.totalTasks} tasks, ${stage19Data.openIssues} open issues`
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

  // Normalize sprint summary
  const ss = parsed.sprintSummary || {};
  const sprintSummary = {
    sprintGoal: String(ss.sprintGoal || stage18Data?.sprintGoal || 'Sprint goal').substring(0, 300),
    itemsPlanned: typeof ss.itemsPlanned === 'number' ? ss.itemsPlanned : (stage18Data?.totalItems || 0),
    itemsCompleted: typeof ss.itemsCompleted === 'number' ? ss.itemsCompleted : (stage19Data?.completedTasks || 0),
    qualityAssessment: String(ss.qualityAssessment || `${stage20Data.overallPassRate || 0}% pass rate`).substring(0, 300),
    integrationStatus: String(ss.integrationStatus || `${stage21Data.passingIntegrations || 0}/${stage21Data.totalIntegrations || 0} passing`).substring(0, 300),
  };

  logger.log('[Stage22] Analysis complete', { duration: Date.now() - startTime });
  return {
    releaseItems,
    releaseNotes,
    targetDate,
    releaseDecision,
    sprintRetrospective,
    sprintSummary,
    totalItems: releaseItems.length,
    approvedItems: releaseItems.filter(ri => ri.status === 'approved').length,
    allApproved: releaseItems.every(ri => ri.status === 'approved'),
    fourBuckets, usage,
  };
}


export { RELEASE_DECISIONS, RELEASE_CATEGORIES };
