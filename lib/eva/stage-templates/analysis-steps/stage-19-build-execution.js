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
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { getContract } from '../../contracts/financial-contract.js';

// NOTE: These constants intentionally duplicated from stage-19.js
// to avoid circular dependency — stage-19.js imports analyzeStage19 from this file,
// and SYSTEM_PROMPT uses these constants at module-level evaluation.
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
 * When real data exists in venture_stage_work (written by sd-completed.js),
 * uses that instead of LLM synthesis. Falls back to LLM when no real data found.
 *
 * @param {Object} params
 * @param {Object} params.stage18Data - Sprint plan
 * @param {Object} [params.stage17Data] - Build readiness
 * @param {string} [params.ventureName]
 * @param {Object} [params.supabase] - Supabase client for real data queries
 * @param {string} [params.ventureId] - Venture UUID for real data queries
 * @returns {Promise<Object>} Build execution progress
 */
export async function analyzeStage19({ stage18Data, stage17Data, ventureName, supabase, ventureId, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage19] Starting analysis', { ventureName });
  if (!stage18Data) {
    throw new Error('Stage 19 build execution requires Stage 18 (sprint planning) data');
  }

  // Try real data from venture_stage_work (written by sd-completed.js handler)
  if (supabase && ventureId) {
    try {
      const realData = await fetchRealBuildData(supabase, ventureId, logger);
      if (realData) {
        logger.log('[Stage19] Using real data from venture_stage_work', {
          tasks: realData.tasks.length,
          completion_pct: realData.completion_pct,
        });
        return realData;
      }
    } catch (err) {
      logger.warn('[Stage19] Real data query failed, falling back to LLM', { error: err.message });
    }
  }

  logger.log('[Stage19] No real data found, using LLM synthesis');
  const client = getLLMClient({ purpose: 'content-generation' });

  const sprintContext = stage18Data.sprint_goal
    ? `Sprint Goal: ${stage18Data.sprint_goal}`
    : '';

  const itemsContext = stage18Data.items
    ? `Sprint Items (${stage18Data.items.length}): ${JSON.stringify(stage18Data.items.map(i => ({ title: i.title, type: i.type, story_points: i.story_points })))}`
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

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize tasks
  let tasks = Array.isArray(parsed.tasks)
    ? parsed.tasks.filter(t => t?.name)
    : [];

  const sprintItems = stage18Data.items || [];
  if (tasks.length === 0 && sprintItems.length > 0) {
    tasks = sprintItems.map(item => ({
      name: item.title,
      description: item.description || '',
      assignee: 'Unassigned',
      status: 'pending',
      sprint_item_ref: item.title,
    }));
  } else {
    tasks = tasks.map((t, idx) => ({
      name: String(t.name).substring(0, 200),
      description: String(t.description || '').substring(0, 500),
      assignee: String(t.assignee || 'Unassigned').substring(0, 200),
      status: TASK_STATUSES.includes(t.status) ? t.status : 'pending',
      sprint_item_ref: sprintItems[idx]?.title || String(t.name).substring(0, 200),
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

  // Compute derived fields (these live in computeDerived but that path is dead code when analysisStep exists)
  const total_tasks = tasks.length;
  const completed_tasks = doneTasks;
  const blocked_tasks = blockedTasks;
  const completion_pct = total_tasks > 0
    ? Math.round((completed_tasks / total_tasks) * 10000) / 100
    : 0;

  const tasks_by_status = {};
  for (const status of TASK_STATUSES) {
    tasks_by_status[status] = tasks.filter(t => t.status === status).length;
  }

  // Track LLM fallback fields
  let llmFallbackCount = 0;
  if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) llmFallbackCount++;
  for (const t of parsed.tasks || []) {
    if (!TASK_STATUSES.includes(t?.status)) llmFallbackCount++;
  }
  for (const i of parsed.issues || []) {
    if (!ISSUE_SEVERITIES.includes(i?.severity)) llmFallbackCount++;
    if (!ISSUE_STATUSES.includes(i?.status)) llmFallbackCount++;
  }
  if (!COMPLETION_DECISIONS.includes(sc.decision)) llmFallbackCount++;
  if (llmFallbackCount > 0) {
    logger.warn('[Stage19] LLM fallback fields detected', { llmFallbackCount });
  }

  // Attach financial contract context for build cost reference
  let financialContract = null;
  if (ventureName) {
    try {
      financialContract = await getContract(ventureName);
    } catch (_) { /* non-blocking */ }
  }

  logger.log('[Stage19] Analysis complete', { duration: Date.now() - startTime });
  return {
    tasks,
    issues,
    sprintCompletion,
    total_tasks,
    completed_tasks,
    blocked_tasks,
    completion_pct,
    tasks_by_status,
    financialContract: financialContract ? { capitalRequired: financialContract.capital_required } : null,
    llmFallbackCount,
    fourBuckets, usage,
  };
}


/**
 * Fetch real build data from venture_stage_work (written by sd-completed.js).
 * Returns null if no real data exists (pre-bridge ventures).
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {Object} logger
 * @returns {Promise<Object|null>} Real build data or null
 */
async function fetchRealBuildData(supabase, ventureId, logger) {
  const { data, error } = await supabase
    .from('venture_stage_work')
    .select('advisory_data, stage_status, health_score')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 19)
    .maybeSingle();

  if (error) throw error;
  if (!data?.advisory_data?.tasks?.length) return null;

  const ad = data.advisory_data;
  // Map sd-completed.js task statuses (todo/in_progress/done/blocked)
  // to stage-19 schema statuses (pending/in_progress/done/blocked)
  const tasks = ad.tasks.map(t => ({
    name: String(t.name || '').substring(0, 200),
    description: String(t.description || '').substring(0, 500),
    assignee: String(t.assignee || 'leo-protocol').substring(0, 200),
    status: t.status === 'todo' ? 'pending' : (TASK_STATUSES.includes(t.status) ? t.status : 'pending'),
    sprint_item_ref: String(t.sprint_item_ref || t.name || '').substring(0, 200),
  }));

  const issues = Array.isArray(ad.issues) ? ad.issues.map(i => ({
    description: String(i.description || '').substring(0, 500),
    severity: ISSUE_SEVERITIES.includes(i.severity) ? i.severity : 'medium',
    status: ISSUE_STATUSES.includes(i.status) ? i.status : 'open',
  })) : [];

  const total_tasks = tasks.length;
  const completed_tasks = tasks.filter(t => t.status === 'done').length;
  const blocked_tasks = tasks.filter(t => t.status === 'blocked').length;
  const completion_pct = total_tasks > 0
    ? Math.round((completed_tasks / total_tasks) * 10000) / 100
    : 0;

  const tasks_by_status = {};
  for (const status of TASK_STATUSES) {
    tasks_by_status[status] = tasks.filter(t => t.status === status).length;
  }

  const hasBlockers = blocked_tasks > 0 || issues.some(i => i.severity === 'critical' && i.status === 'open');
  const decision = hasBlockers ? 'blocked' : completed_tasks === total_tasks ? 'complete' : 'continue';

  return {
    tasks,
    issues,
    sprintCompletion: {
      decision,
      readyForQa: completed_tasks > 0 && !hasBlockers,
      rationale: `Real data: ${completed_tasks}/${total_tasks} tasks done (${completion_pct}%)`,
    },
    total_tasks,
    completed_tasks,
    blocked_tasks,
    completion_pct,
    tasks_by_status,
    financialContract: null,
    llmFallbackCount: 0,
    fourBuckets: null,
    usage: null,
    dataSource: 'venture_stage_work',
  };
}


export { TASK_STATUSES, ISSUE_SEVERITIES, ISSUE_STATUSES, COMPLETION_DECISIONS };
