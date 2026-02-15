/**
 * Stage 19 Analysis Step - Build Execution Progress
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-EVA-FEAT-TEMPLATES-BUILDLOOP-001
 *
 * Consumes Stage 18 sprint items and synthesizes build progress,
 * issue tracking, and sprint completion decision.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-19-build-execution
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';

const TASK_STATUSES = ['pending', 'in_progress', 'done', 'blocked'];
const ISSUE_SEVERITIES = ['critical', 'high', 'medium', 'low'];
const ISSUE_STATUSES = ['open', 'investigating', 'resolved', 'deferred'];
const COMPLETION_DECISIONS = ['complete', 'continue', 'blocked'];

const SYSTEM_PROMPT = `You are EVA's Build Execution Analyst. Synthesize build progress from sprint items and generate a sprint completion assessment.

You MUST output valid JSON with exactly this structure:
{
  "tasks": [
    {
      "name": "Task name (maps to sprint item title)",
      "description": "Current status details",
      "assignee": "Team member or role",
      "status": "pending|in_progress|done|blocked"
    }
  ],
  "issues": [
    {
      "description": "Issue description",
      "severity": "critical|high|medium|low",
      "status": "open|investigating|resolved|deferred"
    }
  ],
  "sprintCompletion": {
    "decision": "complete|continue|blocked",
    "readyForQa": true,
    "rationale": "2-3 sentence assessment of sprint status"
  }
}

Rules:
- Map each sprint item to a task with realistic progress status
- Issues should flag risks, blockers, or concerns discovered during build
- sprintCompletion.decision: "complete" if all tasks done, "continue" if in-progress work remains, "blocked" if critical blockers exist
- readyForQa: true only if core functionality is testable (even if not all tasks complete)
- Be realistic about progress — early-stage ventures likely have tasks still in progress`;

/**
 * Synthesize build execution progress from sprint data.
 *
 * @param {Object} params
 * @param {Object} params.stage18Data - Sprint plan
 * @param {Object} [params.stage17Data] - Build readiness
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Build execution progress
 */
export async function analyzeStage19({ stage18Data, stage17Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage19] Starting analysis', { ventureName });
  if (!stage18Data) {
    throw new Error('Stage 19 build execution requires Stage 18 (sprint planning) data');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const sprintContext = stage18Data.sprintGoal
    ? `Sprint Goal: ${stage18Data.sprintGoal}`
    : '';

  const itemsContext = stage18Data.sprintItems
    ? `Sprint Items (${stage18Data.sprintItems.length}): ${JSON.stringify(stage18Data.sprintItems.map(i => ({ title: i.title, type: i.type, loc: i.estimatedLoc })))}`
    : '';

  const readinessContext = stage17Data?.buildReadiness
    ? `Build Readiness: ${stage17Data.buildReadiness.decision}`
    : '';

  const userPrompt = `Synthesize build execution progress for this venture's sprint.

Venture: ${ventureName || 'Unnamed'}
${sprintContext}
${itemsContext}
${readinessContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize tasks
  let tasks = Array.isArray(parsed.tasks)
    ? parsed.tasks.filter(t => t?.name)
    : [];

  if (tasks.length === 0 && stage18Data.sprintItems?.length > 0) {
    tasks = stage18Data.sprintItems.map(item => ({
      name: item.title,
      description: item.description || '',
      assignee: 'Unassigned',
      status: 'pending',
    }));
  } else {
    tasks = tasks.map(t => ({
      name: String(t.name).substring(0, 200),
      description: String(t.description || '').substring(0, 500),
      assignee: String(t.assignee || 'Unassigned').substring(0, 200),
      status: TASK_STATUSES.includes(t.status) ? t.status : 'pending',
    }));
  }

  // Normalize issues
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.filter(i => i?.description).map(i => ({
        description: String(i.description).substring(0, 500),
        severity: ISSUE_SEVERITIES.includes(i.severity) ? i.severity : 'medium',
        status: ISSUE_STATUSES.includes(i.status) ? i.status : 'open',
      }))
    : [];

  // Normalize sprintCompletion decision
  const sc = parsed.sprintCompletion || {};
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const blockedTasks = tasks.filter(t => t.status === 'blocked').length;
  const hasBlockers = blockedTasks > 0 || issues.some(i => i.severity === 'critical' && i.status === 'open');

  const decision = COMPLETION_DECISIONS.includes(sc.decision)
    ? sc.decision
    : hasBlockers ? 'blocked' : doneTasks === tasks.length ? 'complete' : 'continue';

  const readyForQa = typeof sc.readyForQa === 'boolean'
    ? sc.readyForQa
    : doneTasks > 0 && !hasBlockers;

  const sprintCompletion = {
    decision,
    readyForQa,
    rationale: String(sc.rationale || `Sprint ${decision}: ${doneTasks}/${tasks.length} tasks done`).substring(0, 500),
  };

  logger.log('[Stage19] Analysis complete', { duration: Date.now() - startTime });
  return {
    tasks,
    issues,
    sprintCompletion,
    totalTasks: tasks.length,
    completedTasks: doneTasks,
    blockedTasks,
    openIssues: issues.filter(i => i.status === 'open').length,
    fourBuckets,
  };
}


export { TASK_STATUSES, ISSUE_SEVERITIES, ISSUE_STATUSES, COMPLETION_DECISIONS };
