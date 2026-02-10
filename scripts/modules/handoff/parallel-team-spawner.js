/**
 * Parallel Team Spawner
 * SD-LEO-FEAT-WIRE-PARALLEL-TEAM-001
 *
 * Bridge between ParallelCoordinator, AgentExperienceFactory, worktree manager,
 * and Claude Code's team tools. Node.js computes the schedule and returns
 * structured instructions; Claude Code executes team operations.
 *
 * Exports:
 *   planParallelExecution(supabase, parentSdId, completedChildId)
 *   onChildComplete(coordinatorStatePath, childId, status, details)
 *   buildTeammatePrompt(supabase, childSD, worktreePath)
 *   getCoordinatorState(coordinatorStatePath)
 *
 * @module parallel-team-spawner
 */

import fs from 'fs';
import path from 'path';
import { getReadyChildren } from './child-sd-selector.js';
import { ParallelCoordinator } from '../../../lib/orchestrator/parallel-coordinator.js';
import { AgentExperienceFactory } from '../../../lib/agent-experience-factory/factory.js';
import { createWorkTypeWorktree } from '../../../lib/worktree-manager.js';

/** Default timeout for unresponsive teammates (30 min) */
const DEFAULT_CHILD_TIMEOUT_MS = parseInt(process.env.ORCH_CHILD_TIMEOUT_MS || '1800000', 10);

/**
 * Plan parallel execution for an orchestrator's children.
 *
 * Called when a child completes LEAD-FINAL-APPROVAL and parallel mode is enabled.
 * Determines whether to use parallel or sequential mode, creates worktrees,
 * builds teammate prompts, and returns structured instructions for Claude Code.
 *
 * @param {object} supabase - Supabase client
 * @param {string} parentSdId - Parent orchestrator SD ID (UUID)
 * @param {string} completedChildId - Just-completed child ID to exclude
 * @returns {Promise<{mode: 'parallel'|'sequential', teamName?: string, toStart?: Array, coordinatorStatePath?: string, totalChildren?: number, readyCount?: number, reason: string}>}
 */
export async function planParallelExecution(supabase, parentSdId, completedChildId) {
  // Fetch all ready children using DAG-aware selector
  const { children: readyChildren, allComplete, dagErrors, reason: selectorReason } =
    await getReadyChildren(supabase, parentSdId, {
      excludeCompletedId: completedChildId,
      parallelEnabled: true
    });

  // If all complete or fewer than 2 ready, fall back to sequential
  if (allComplete) {
    return { mode: 'sequential', reason: 'All children complete' };
  }

  if (readyChildren.length < 2) {
    return { mode: 'sequential', reason: `Only ${readyChildren.length} child ready - sequential is sufficient` };
  }

  // Fetch ALL children (including completed) for coordinator state
  const { data: allChildren, error: allError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, priority, current_phase, sequence_rank, created_at, metadata, dependencies, updated_at, progress_percentage, sd_type')
    .eq('parent_sd_id', parentSdId);

  if (allError) {
    return { mode: 'sequential', reason: `DB error fetching all children: ${allError.message}` };
  }

  // Derive parent SD key for naming
  const { data: parentSD } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key')
    .eq('id', parentSdId)
    .single();

  const parentSdKey = parentSD?.sd_key || parentSdId;
  const teamName = `orch-${parentSdKey.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase().substring(0, 40)}`;

  // Create coordinator
  let coordinator;
  try {
    coordinator = new ParallelCoordinator(allChildren, {
      parallelEnabled: true,
      runId: `run-${Date.now()}`
    });
  } catch (err) {
    // Cycle detected or other DAG error - fall back to sequential
    return { mode: 'sequential', reason: `Coordinator error: ${err.message}` };
  }

  // Mark already-completed children in coordinator
  for (const child of allChildren) {
    if (child.status === 'completed') {
      coordinator.onChildComplete(child.id, 'succeeded');
    }
  }

  // Get initial schedule
  const schedule = coordinator.getInitialSchedule();

  if (schedule.toStart.length < 2) {
    return { mode: 'sequential', reason: `Only ${schedule.toStart.length} child schedulable after DAG analysis` };
  }

  // Prepare each child to start: create worktree and build prompt
  const toStart = [];

  for (const childId of schedule.toStart) {
    const childSD = allChildren.find(c => c.id === childId);
    if (!childSD) continue;

    const sdKey = childSD.sd_key || childId;

    // Create worktree for this child
    let worktreePath;
    try {
      const wtResult = createWorkTypeWorktree({ workType: 'SD', workKey: sdKey });
      worktreePath = wtResult.path;
    } catch (wtErr) {
      console.warn(`   [parallel-team-spawner] Worktree creation failed for ${sdKey}: ${wtErr.message}`);
      continue; // Skip this child - sequential can handle it
    }

    // Mark started in coordinator
    coordinator.markStarted(childId, worktreePath);

    // Build teammate prompt (AEF enrichment done asynchronously below)
    const prompt = await buildTeammatePrompt(supabase, childSD, worktreePath);

    toStart.push({
      id: childId,
      sdKey,
      title: childSD.title,
      sdType: childSD.sd_type,
      worktreePath,
      prompt
    });
  }

  // If worktree failures reduced to <2 startable, fall back
  if (toStart.length < 2) {
    return { mode: 'sequential', reason: `Only ${toStart.length} child could be prepared (worktree failures)` };
  }

  // Persist coordinator state
  const coordinatorStatePath = getStateFilePath(parentSdKey);
  saveCoordinatorState(coordinatorStatePath, coordinator, {
    parentSdId,
    parentSdKey,
    teamName,
    childTimeoutMs: DEFAULT_CHILD_TIMEOUT_MS
  });

  return {
    mode: 'parallel',
    teamName,
    toStart,
    coordinatorStatePath,
    totalChildren: allChildren.length,
    readyCount: toStart.length,
    dagErrors: dagErrors.length > 0 ? dagErrors : undefined,
    reason: `${toStart.length} independent children ready for parallel execution`
  };
}

/**
 * Handle a child's completion. Updates coordinator state and returns
 * newly unblocked children to spawn.
 *
 * @param {string} coordinatorStatePath - Path to coordinator state JSON
 * @param {string} childId - Completed child SD ID
 * @param {'succeeded'|'failed'|'canceled'} status - Completion status
 * @param {object} [details] - Additional details (tokensUsed, reason)
 * @param {object} [supabase] - Supabase client (needed if new children are unblocked)
 * @returns {Promise<{newlyReady: Array, toSkip: string[], allComplete: boolean, runSummary?: object, reason: string}>}
 */
export async function onChildComplete(coordinatorStatePath, childId, status, details = {}, supabase = null) {
  const state = loadCoordinatorState(coordinatorStatePath);
  if (!state) {
    return { newlyReady: [], toSkip: [], allComplete: false, reason: 'Could not load coordinator state' };
  }

  // Reconstruct coordinator from saved state
  const coordinator = reconstructCoordinator(state);

  // Record completion
  const schedule = coordinator.onChildComplete(childId, status, details);

  if (schedule.allTerminal) {
    const runSummary = coordinator.getRunSummary();
    saveCoordinatorState(coordinatorStatePath, coordinator, state.meta);
    return {
      newlyReady: [],
      toSkip: schedule.toSkip,
      allComplete: true,
      runSummary,
      reason: 'All children in terminal state'
    };
  }

  // Prepare newly unblocked children
  const newlyReady = [];

  if (schedule.toStart.length > 0 && supabase) {
    // Fetch child SD details for the newly unblocked
    const { data: childSDs } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, sd_type, metadata')
      .in('id', schedule.toStart);

    for (const childSD of (childSDs || [])) {
      const sdKey = childSD.sd_key || childSD.id;

      let worktreePath;
      try {
        const wtResult = createWorkTypeWorktree({ workType: 'SD', workKey: sdKey });
        worktreePath = wtResult.path;
      } catch (wtErr) {
        console.warn(`   [parallel-team-spawner] Worktree failed for ${sdKey}: ${wtErr.message}`);
        continue;
      }

      coordinator.markStarted(childSD.id, worktreePath);

      const prompt = await buildTeammatePrompt(supabase, childSD, worktreePath);
      newlyReady.push({
        id: childSD.id,
        sdKey,
        title: childSD.title,
        sdType: childSD.sd_type,
        worktreePath,
        prompt
      });
    }
  }

  // Persist updated state
  saveCoordinatorState(coordinatorStatePath, coordinator, state.meta);

  const runSummary = coordinator.getRunSummary();
  return {
    newlyReady,
    toSkip: schedule.toSkip,
    allComplete: false,
    runSummary,
    reason: newlyReady.length > 0
      ? `${newlyReady.length} newly unblocked children ready`
      : 'No new children unblocked'
  };
}

/**
 * Build the full instruction prompt for a teammate, enriched by AEF.
 *
 * @param {object} supabase - Supabase client
 * @param {object} childSD - Child SD record
 * @param {string} worktreePath - Path to the child's worktree
 * @returns {Promise<string>} Full instruction prompt
 */
export async function buildTeammatePrompt(supabase, childSD, worktreePath) {
  const sdKey = childSD.sd_key || childSD.id;
  const sdType = childSD.sd_type || 'feature';

  // Try AEF enrichment (fail-open: empty preamble if AEF fails)
  let aefPreamble = '';
  try {
    const factory = new AgentExperienceFactory(supabase);
    const { promptPreamble } = await factory.compose({
      agentCode: sdType.toUpperCase(),
      domain: sdType,
      sessionId: `parallel-${sdKey}-${Date.now()}`,
      sdId: sdKey,
      maxPromptTokens: 800
    });
    aefPreamble = promptPreamble;
  } catch {
    // AEF failure is non-blocking
  }

  return `# Parallel Child SD Assignment

## Your Child SD
- **SD Key**: ${sdKey}
- **Title**: ${childSD.title || 'Untitled'}
- **Type**: ${sdType}
- **Status**: ${childSD.status || 'draft'}

## Worktree
- **Path**: ${worktreePath}
- All file operations MUST use this worktree path as working directory.

## Workflow
1. Read CLAUDE.md and CLAUDE_CORE.md (mandatory protocol files)
2. Run: \`npm run sd:start ${sdKey}\` to claim the SD
3. Execute LEAD-TO-PLAN handoff: \`node scripts/handoff.js execute LEAD-TO-PLAN ${sdKey}\`
4. Follow the full LEO Protocol workflow for this SD type (${sdType})
5. Work through all required phases until LEAD-FINAL-APPROVAL
6. When complete: mark your task as completed via TaskUpdate
7. Send completion message to team lead via SendMessage

## Reporting
When done, send a message to the team lead with:
- Child SD key: ${sdKey}
- Final status: succeeded or failed
- If failed: include error details

## Rules
- Work ONLY in your assigned worktree: ${worktreePath}
- Follow AUTO-PROCEED rules (no user prompts)
- If blocked, report to team lead immediately via SendMessage
${aefPreamble}`;
}

/**
 * Read current coordinator state from file.
 *
 * @param {string} coordinatorStatePath - Path to state JSON
 * @returns {object|null} Coordinator state or null if not found
 */
export function getCoordinatorState(coordinatorStatePath) {
  return loadCoordinatorState(coordinatorStatePath);
}

// ── Internal helpers ──

/**
 * Get the state file path for a parent SD.
 * @param {string} parentSdKey
 * @returns {string}
 */
function getStateFilePath(parentSdKey) {
  const sanitized = parentSdKey.replace(/[^a-zA-Z0-9_-]/g, '-');
  const worktreesDir = path.join(process.cwd(), '.worktrees');
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }
  return path.join(worktreesDir, `_coordinator-${sanitized}.json`);
}

/**
 * Save coordinator state to JSON file (atomic write).
 * @param {string} filePath
 * @param {ParallelCoordinator} coordinator
 * @param {object} meta - Extra metadata (parentSdId, teamName, etc.)
 */
function saveCoordinatorState(filePath, coordinator, meta) {
  const state = {
    meta,
    config: coordinator.config,
    children: Object.fromEntries(coordinator.children),
    dagNodes: Object.fromEntries(coordinator.dag.nodes),
    dagRootIds: coordinator.dag.rootIds,
    dagErrors: coordinator.dagErrors,
    startTime: coordinator.startTime,
    maxConcurrencyObserved: coordinator.maxConcurrencyObserved,
    events: coordinator.events,
    budgetUsed: coordinator.budgetUsed,
    budgetExceeded: coordinator.budgetExceeded,
    savedAt: new Date().toISOString()
  };

  // Atomic write: write to temp file then rename
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Load coordinator state from JSON file.
 * @param {string} filePath
 * @returns {object|null}
 */
function loadCoordinatorState(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Reconstruct a ParallelCoordinator from saved state.
 * We can't use the constructor directly (it rebuilds the DAG),
 * so we reconstruct the internal state manually.
 *
 * @param {object} state - Saved state from loadCoordinatorState
 * @returns {ParallelCoordinator}
 */
function reconstructCoordinator(state) {
  // Build minimal children array for constructor (it rebuilds the DAG)
  const childRecords = [];
  for (const [id, entry] of Object.entries(state.children)) {
    const dagNode = state.dagNodes[id];
    childRecords.push({
      id,
      sd_key: entry.sdKey,
      metadata: dagNode ? { blocked_by: dagNode.blockedBy } : {}
    });
  }

  const coordinator = new ParallelCoordinator(childRecords, state.config);

  // Restore child states
  for (const [id, entry] of Object.entries(state.children)) {
    const child = coordinator.children.get(id);
    if (child) {
      child.state = entry.state;
      child.startedAt = entry.startedAt;
      child.completedAt = entry.completedAt;
      child.worktreePath = entry.worktreePath;
      child.reason = entry.reason;
    }
  }

  // Restore metrics
  coordinator.startTime = state.startTime;
  coordinator.maxConcurrencyObserved = state.maxConcurrencyObserved;
  coordinator.events = state.events || [];
  coordinator.budgetUsed = state.budgetUsed || 0;
  coordinator.budgetExceeded = state.budgetExceeded || false;

  return coordinator;
}

export default {
  planParallelExecution,
  onChildComplete,
  buildTeammatePrompt,
  getCoordinatorState
};
