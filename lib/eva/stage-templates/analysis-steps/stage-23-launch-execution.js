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

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';

const LAUNCH_TYPES = ['soft_launch', 'beta', 'general_availability'];
const TASK_STATUSES = ['pending', 'in_progress', 'done', 'blocked'];
const CRITERION_PRIORITIES = ['primary', 'secondary'];

const SYSTEM_PROMPT = `You are EVA's Launch Execution Analyst. Synthesize Stage 22 release readiness data into a launch brief with success criteria.

You MUST output valid JSON with exactly this structure:
{
  "launchType": "soft_launch|beta|general_availability",
  "launchBrief": "2-4 sentence summary of what is being launched and why",
  "successCriteria": [
    {
      "metric": "Name of the metric to track",
      "target": "Specific measurable target (e.g., '100 signups in 7 days')",
      "measurementWindow": "Time window for measurement (e.g., '7 days', '30 days')",
      "priority": "primary|secondary"
    }
  ],
  "rollbackTriggers": [
    {
      "condition": "When this condition is met, rollback should be considered",
      "severity": "critical|warning"
    }
  ],
  "launchTasks": [
    {
      "name": "Task description",
      "owner": "Role responsible",
      "status": "pending|in_progress|done|blocked"
    }
  ],
  "plannedLaunchDate": "YYYY-MM-DD"
}

Rules:
- launchType should reflect the venture's maturity and release scope
- At least 2 success criteria required (at least 1 primary)
- At least 1 rollback trigger required
- At least 1 launch task required
- plannedLaunchDate should be reasonable (within 1-4 weeks)
- Success criteria become the contract with Stage 24 for evaluation`;

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

  const client = getLLMClient({ purpose: 'content-generation' });

  const releaseContext = stage22Data.releaseDecision
    ? `Release: ${stage22Data.releaseDecision.decision} — ${stage22Data.releaseDecision.rationale}`
    : '';

  const itemsContext = Array.isArray(stage22Data.releaseItems)
    ? `Items: ${stage22Data.releaseItems.map(ri => `${ri.name} (${ri.status})`).join(', ')}`
    : '';

  const retroContext = stage22Data.sprintRetrospective
    ? `Retro highlights: ${(stage22Data.sprintRetrospective.wentWell || []).slice(0, 2).join('; ')}`
    : '';

  const stage1Criteria = stage01Data?.successCriteria
    ? `Stage 1 success criteria: ${JSON.stringify(stage01Data.successCriteria)}`
    : '';

  const userPrompt = `Generate launch execution brief for this venture.

Venture: ${ventureName || 'Unnamed'}
${releaseContext}
${itemsContext}
${retroContext}
${stage1Criteria}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt);
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize launchType
  const launchType = LAUNCH_TYPES.includes(parsed.launchType)
    ? parsed.launchType
    : 'soft_launch';

  // Normalize launch brief
  const launchBrief = String(parsed.launchBrief || 'Launch brief pending.').substring(0, 1000);

  // Normalize success criteria
  let successCriteria = Array.isArray(parsed.successCriteria)
    ? parsed.successCriteria.filter(sc => sc?.metric)
    : [];

  if (successCriteria.length < 2) {
    successCriteria = [
      { metric: 'User signups', target: '50 in first week', measurementWindow: '7 days', priority: 'primary' },
      { metric: 'Error rate', target: 'Below 5%', measurementWindow: '7 days', priority: 'secondary' },
    ];
  } else {
    successCriteria = successCriteria.map(sc => ({
      metric: String(sc.metric).substring(0, 200),
      target: String(sc.target || 'TBD').substring(0, 200),
      measurementWindow: String(sc.measurementWindow || '30 days').substring(0, 100),
      priority: CRITERION_PRIORITIES.includes(sc.priority) ? sc.priority : 'secondary',
    }));
  }

  // Ensure at least one primary criterion
  if (!successCriteria.some(sc => sc.priority === 'primary')) {
    successCriteria[0].priority = 'primary';
  }

  // Normalize rollback triggers
  let rollbackTriggers = Array.isArray(parsed.rollbackTriggers)
    ? parsed.rollbackTriggers.filter(rt => rt?.condition)
    : [];

  if (rollbackTriggers.length === 0) {
    rollbackTriggers = [{
      condition: 'Error rate exceeds 10% for 1 hour',
      severity: 'critical',
    }];
  } else {
    rollbackTriggers = rollbackTriggers.map(rt => ({
      condition: String(rt.condition).substring(0, 300),
      severity: ['critical', 'warning'].includes(rt.severity) ? rt.severity : 'warning',
    }));
  }

  // Normalize launch tasks
  let launchTasks = Array.isArray(parsed.launchTasks)
    ? parsed.launchTasks.filter(lt => lt?.name)
    : [];

  if (launchTasks.length === 0) {
    launchTasks = [{
      name: 'Execute launch checklist',
      owner: 'Product Owner',
      status: 'pending',
    }];
  } else {
    launchTasks = launchTasks.map(lt => ({
      name: String(lt.name).substring(0, 200),
      owner: String(lt.owner || 'Unassigned').substring(0, 200),
      status: TASK_STATUSES.includes(lt.status) ? lt.status : 'pending',
    }));
  }

  // Normalize planned launch date
  const plannedLaunchDate = parsed.plannedLaunchDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.plannedLaunchDate)
    ? parsed.plannedLaunchDate
    : new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

  logger.log('[Stage23] Analysis complete', { duration: Date.now() - startTime });
  return {
    launchType,
    launchBrief,
    successCriteria,
    rollbackTriggers,
    launchTasks,
    plannedLaunchDate,
    totalTasks: launchTasks.length,
    blockedTasks: launchTasks.filter(lt => lt.status === 'blocked').length,
    primaryCriteria: successCriteria.filter(sc => sc.priority === 'primary').length,
    totalCriteria: successCriteria.length,
    fourBuckets,
  };
}


export { LAUNCH_TYPES, TASK_STATUSES, CRITERION_PRIORITIES };
