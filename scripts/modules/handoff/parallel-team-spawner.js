/**
 * Parallel Team Spawner
 * SD-LEO-FEAT-WIRE-PARALLEL-TEAM-001 (FR-1..FR-6, TR-1..TR-3)
 *
 * Bridge module that plans parallel execution for orchestrator children.
 * Composes: child-sd-selector + worktree-manager + AEF + coordinator state.
 *
 * Pure planning logic: does not write to stdout (TR-1).
 * cli-main.js is responsible for all I/O.
 *
 * @module parallel-team-spawner
 */

import { getReadyChildren } from './child-sd-selector.js';
import { safeTruncate } from '../../../lib/utils/safe-truncate.js';
import { createWorktree, getRepoRoot } from '../../../lib/worktree-manager.js';
import { compose } from '../../../lib/agent-experience-factory/index.js';
import fs from 'fs';
import path from 'path';

const SCHEMA_VERSION = '1.0';
const DEFAULT_MAX_CONCURRENCY = 3;
const AGENT_DEFINITION_PATH = '.claude/agents/orchestrator-child-agent.md';
const STATE_DIR_NAME = 'parallel-state';

// ─── Concurrency Configuration (FR-6) ───

let _concurrencyWarned = false;

/**
 * Parse ORCH_MAX_CONCURRENCY from environment.
 * Defaults to 3 if missing or invalid. Warns once per process.
 * @returns {number}
 */
function parseMaxConcurrency() {
  const raw = process.env.ORCH_MAX_CONCURRENCY;
  if (raw === undefined || raw === '') return DEFAULT_MAX_CONCURRENCY;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    if (!_concurrencyWarned) {
      console.warn(
        `[parallel-team-spawner] ORCH_MAX_CONCURRENCY="${raw}" is invalid ` +
        `(must be integer >=1). Defaulting to ${DEFAULT_MAX_CONCURRENCY}.`
      );
      _concurrencyWarned = true;
    }
    return DEFAULT_MAX_CONCURRENCY;
  }
  return parsed;
}

// ─── Coordinator State Persistence (FR-5, TR-2) ───

/**
 * Get coordinator state file path for an orchestrator.
 * @param {string} repoRoot
 * @param {string} orchestratorKey
 * @returns {string}
 */
function getStatePath(repoRoot, orchestratorKey) {
  const sanitized = orchestratorKey.replace(/[^a-zA-Z0-9_-]/g, '-');
  return path.join(repoRoot, '.claude', STATE_DIR_NAME, `${sanitized}.json`);
}

/**
 * Load coordinator state from disk.
 * Ignores leftover .tmp files and handles corruption gracefully (FR-5, TR-2).
 * @param {string} statePath
 * @returns {Object}
 */
function loadState(statePath) {
  const empty = {
    schemaVersion: SCHEMA_VERSION,
    children: {},
    createdAt: new Date().toISOString()
  };

  // Clean up leftover .tmp from interrupted writes
  const tmpPath = `${statePath}.tmp`;
  try {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  } catch { /* ignore */ }

  try {
    if (!fs.existsSync(statePath)) return empty;
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.children) {
      console.warn('[parallel-team-spawner] Invalid state schema, reinitializing');
      return empty;
    }
    return parsed;
  } catch (err) {
    console.warn(`[parallel-team-spawner] State read error: ${err.message}. Using empty state.`);
    return empty;
  }
}

/**
 * Atomically write JSON to disk (temp + fsync + rename) (TR-2).
 * @param {string} filePath
 * @param {Object} data
 */
function atomicWriteJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');

  const fd = fs.openSync(tmpPath, 'r+');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }

  fs.renameSync(tmpPath, filePath);
}

// ─── Prompt Building (FR-4) ───

/**
 * Build AEF-enriched child prompt with DYNAMIC KNOWLEDGE preamble.
 * Includes explicit childSdId and orchestratorSdId keys (FR-4 acceptance criteria).
 * @param {Object} params
 * @returns {string}
 */
function buildChildPrompt({
  aefPreamble,
  childSdId,
  childSdKey,
  childSdType,
  childTitle,
  orchestratorSdId,
  worktreePath
}) {
  return [
    '<!-- DYNAMIC KNOWLEDGE -->',
    aefPreamble || '',
    '<!-- END DYNAMIC KNOWLEDGE -->',
    '',
    '## Assignment',
    '',
    'You are responsible only for this child SD. Do not modify files outside your scope.',
    '',
    `childSdId: ${childSdId}`,
    `childSdKey: ${childSdKey}`,
    `orchestratorSdId: ${orchestratorSdId}`,
    `sdType: ${childSdType || 'feature'}`,
    `title: ${childTitle || childSdKey}`,
    `worktreePath: ${worktreePath}`,
    '',
    '## Instructions',
    '',
    `1. You are working on child SD **${childSdKey}** of orchestrator **${orchestratorSdId}**.`,
    `2. Your worktree is at: \`${worktreePath}\``,
    '3. Follow the full LEO Protocol workflow: LEAD -> PLAN -> EXEC for this child SD.',
    '4. Run handoffs via: `node scripts/handoff.js execute <HANDOFF_TYPE> <SD_KEY>`',
    '5. When implementation is complete, run the post-completion sequence.',
    '6. Do NOT modify files that belong to sibling child SDs.',
    '7. If you encounter blocking dependencies, report them and stop.',
  ].join('\n');
}

// ─── Main Entry Point ───

/**
 * Plan parallel execution for orchestrator children.
 *
 * Called by cli-main.js when ORCH_PARALLEL_CHILDREN_ENABLED=true.
 * Uses getReadyChildren() for DAG-aware child selection, then provisions
 * worktrees, enriches prompts via AEF, and persists coordinator state.
 *
 * Returns a structured plan for Claude Code to spawn teammates (TR-3).
 *
 * @param {object} supabase - Supabase client
 * @param {string} parentSdId - Parent orchestrator SD UUID
 * @param {string} currentSdId - Just-completed child SD ID to exclude
 * @returns {Promise<Object>} Plan with schemaVersion, mode, toStart, etc.
 */
export async function planParallelExecution(supabase, parentSdId, currentSdId) {
  const repoRoot = getRepoRoot();
  const maxConcurrency = parseMaxConcurrency();

  // 1. Resolve parent SD key for naming and state paths
  let parentSdKey = parentSdId;
  try {
    const { data: parent } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key')
      .eq('id', parentSdId)
      .single();
    if (parent?.sd_key) parentSdKey = parent.sd_key;
  } catch { /* UUID fallback */ }

  // 2. Get ready children via DAG-aware selector (handles deps, urgency, cycles)
  const { children, allComplete, dagErrors, reason } = await getReadyChildren(
    supabase, parentSdId, {
      excludeCompletedId: currentSdId,
      parallelEnabled: true
    }
  );

  if (allComplete) {
    return { schemaVersion: SCHEMA_VERSION, mode: 'sequential', reason: 'All children complete' };
  }

  if (children.length < 2) {
    return {
      schemaVersion: SCHEMA_VERSION,
      mode: 'sequential',
      reason: children.length === 0
        ? (reason || 'No eligible children')
        : `Only ${children.length} eligible child - sequential preferred`
    };
  }

  // 3. Load coordinator state to prevent duplicate starts (FR-5)
  const statePath = getStatePath(repoRoot, parentSdKey);
  const state = loadState(statePath);

  const notStarted = children.filter(c => {
    const s = state.children[c.id];
    return !s || s.status === 'pending';
  });

  if (notStarted.length < 2) {
    return {
      schemaVersion: SCHEMA_VERSION,
      mode: 'sequential',
      reason: notStarted.length === 0
        ? 'All eligible children already started or completed'
        : `Only ${notStarted.length} unstarted child - sequential preferred`
    };
  }

  // 4. Apply concurrency cap (FR-6) with deterministic sort by ID
  const toStartCandidates = notStarted
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, maxConcurrency);

  // 5. Provision worktrees and build AEF-enriched prompts
  const toStart = [];

  for (const child of toStartCandidates) {
    const sdKey = child.sd_key || child.id;
    const branch = safeTruncate(`feat/${sdKey}`, 100);

    // FR-3: Provision or reuse worktree
    let worktreePath;
    const priorState = state.children[child.id];

    if (priorState?.worktreePath && fs.existsSync(priorState.worktreePath)) {
      worktreePath = priorState.worktreePath;
    } else {
      try {
        const wt = createWorktree({ sdKey, branch });
        worktreePath = wt.path;
      } catch (err) {
        // Worktree may already exist on the same branch
        const fallbackPath = path.join(repoRoot, '.worktrees', sdKey);
        if (fs.existsSync(fallbackPath)) {
          worktreePath = fallbackPath;
        } else {
          console.warn(
            `[parallel-team-spawner] Worktree failed for ${sdKey}: ${err.message}`
          );
          continue;
        }
      }
    }

    // FR-4: AEF prompt enrichment with DYNAMIC KNOWLEDGE
    let aefPreamble = '';
    try {
      const { promptPreamble } = await compose({
        agentCode: 'orchestrator-child',
        domain: child.sd_type || 'general',
        sessionId: `parallel-${parentSdKey}-${child.id}`,
        maxPromptTokens: 1200
      });
      aefPreamble = promptPreamble || '';
    } catch { /* AEF failure is non-fatal */ }

    const prompt = buildChildPrompt({
      aefPreamble,
      childSdId: child.id,
      childSdKey: sdKey,
      childSdType: child.sd_type,
      childTitle: child.title,
      orchestratorSdId: parentSdKey,
      worktreePath
    });

    toStart.push({
      sdKey,
      sdType: child.sd_type || 'feature',
      childSdId: child.id,
      orchestratorSdId: parentSdId,
      worktreePath,
      prompt,
      agentDefinitionPath: AGENT_DEFINITION_PATH,
      idempotencyKey: `${parentSdId}:${child.id}`
    });

    // Update coordinator state
    state.children[child.id] = {
      sdKey,
      status: 'started',
      startedAt: new Date().toISOString(),
      worktreePath
    };
  }

  // If fewer than 2 provisioned, fall back to sequential
  if (toStart.length < 2) {
    return {
      schemaVersion: SCHEMA_VERSION,
      mode: 'sequential',
      reason: `Only ${toStart.length} child could be provisioned - sequential preferred`
    };
  }

  // 6. Persist state atomically (FR-5, TR-2)
  state.updatedAt = new Date().toISOString();
  state.orchestratorSdId = parentSdId;
  state.orchestratorSdKey = parentSdKey;
  atomicWriteJSON(statePath, state);

  const teamName = safeTruncate(`orch-${parentSdKey}`, 50);

  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'parallel',
    orchestratorSdId: parentSdId,
    teamName,
    coordinatorStatePath: statePath,
    totalChildren: children.length,
    readyCount: toStart.length,
    toStart,
    dagErrors: dagErrors?.length > 0 ? dagErrors : undefined,
    reason: `${toStart.length} children ready for parallel execution`
  };
}

// ─── State Update Helpers ───

/**
 * Mark a child as completed in coordinator state.
 * Called when a teammate reports child SD completion.
 * @param {string} statePath - Coordinator state file path
 * @param {string} childSdId - UUID of completed child
 * @param {'completed'|'failed'} status
 */
export function markChildCompleted(statePath, childSdId, status = 'completed') {
  const state = loadState(statePath);
  if (state.children[childSdId]) {
    state.children[childSdId].status = status;
    state.children[childSdId].completedAt = new Date().toISOString();
  }
  state.updatedAt = new Date().toISOString();
  atomicWriteJSON(statePath, state);
}

/**
 * Get coordinator state summary.
 * @param {string} statePath
 * @returns {Object}
 */
export function getCoordinatorState(statePath) {
  return loadState(statePath);
}

export default { planParallelExecution, markChildCompleted, getCoordinatorState };
