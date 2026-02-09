/**
 * Parallel Orchestrator Coordinator
 * SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-B (FR-3, FR-4, FR-5, FR-6)
 *
 * Stateful coordinator that manages parallel child SD execution.
 * Computes runnable sets, tracks per-child state, enforces concurrency
 * limits, and produces run summaries with speedup metrics.
 *
 * This coordinator provides the scheduling logic. Actual teammate
 * spawning is performed by the caller (Claude Code via TeamCreate/Task
 * tools or an orchestrator script).
 *
 * Feature flag: ORCH_PARALLEL_CHILDREN_ENABLED (default: false)
 * Concurrency: ORCH_MAX_CONCURRENCY (default: 3)
 * Cost budget: ORCH_PARALLEL_COST_BUDGET (optional, in tokens)
 */

import {
  buildDependencyDAG,
  detectCycles,
  computeRunnableSet
} from './dependency-dag.js';

/** @typedef {'queued'|'running'|'succeeded'|'failed'|'canceled'|'skipped'} ChildState */

/**
 * @typedef {Object} ChildEntry
 * @property {string} id - Child SD id
 * @property {string} sdKey - Child SD key
 * @property {ChildState} state - Current state
 * @property {number|null} startedAt - Timestamp when started
 * @property {number|null} completedAt - Timestamp when completed
 * @property {string|null} worktreePath - Path to assigned worktree
 * @property {string|null} reason - Reason for terminal state (if applicable)
 */

/**
 * @typedef {Object} CoordinatorConfig
 * @property {boolean} [parallelEnabled] - Feature flag (env: ORCH_PARALLEL_CHILDREN_ENABLED)
 * @property {number} [maxConcurrency] - Max parallel children (env: ORCH_MAX_CONCURRENCY, default: 3)
 * @property {number|null} [costBudget] - Token budget per run (env: ORCH_PARALLEL_COST_BUDGET)
 * @property {string} [runId] - Correlation ID for this run
 */

/**
 * @typedef {Object} SchedulingDecision
 * @property {string[]} toStart - Child IDs to spawn teammates for
 * @property {string[]} toSkip - Child IDs to mark as skipped (blocker failed)
 * @property {boolean} allTerminal - Whether all children are in terminal state
 * @property {Object} summary - Current run state summary
 */

export class ParallelCoordinator {
  /**
   * @param {Array<{id: string, sd_key: string, metadata: object}>} children - Child SD records
   * @param {CoordinatorConfig} [config]
   */
  constructor(children, config = {}) {
    this.config = {
      parallelEnabled: config.parallelEnabled ?? (process.env.ORCH_PARALLEL_CHILDREN_ENABLED === 'true'),
      maxConcurrency: config.maxConcurrency ?? parseInt(process.env.ORCH_MAX_CONCURRENCY || '3', 10),
      costBudget: config.costBudget ?? (process.env.ORCH_PARALLEL_COST_BUDGET
        ? parseInt(process.env.ORCH_PARALLEL_COST_BUDGET, 10)
        : null),
      runId: config.runId || `run-${Date.now()}`
    };

    // If parallel is disabled, force maxConcurrency to 1
    if (!this.config.parallelEnabled) {
      this.config.maxConcurrency = 1;
    }

    // Build DAG
    const { dag, errors: dagErrors } = buildDependencyDAG(children);
    const { hasCycles, cyclePath } = detectCycles(dag);

    if (hasCycles) {
      const pathStr = cyclePath.map(id => dag.nodes.get(id)?.sdKey || id).join(' -> ');
      throw new Error(`Dependency cycle detected: ${pathStr}`);
    }

    this.dag = dag;
    this.dagErrors = dagErrors;

    // Initialize child state tracking
    /** @type {Map<string, ChildEntry>} */
    this.children = new Map();
    for (const child of children) {
      this.children.set(child.id, {
        id: child.id,
        sdKey: child.sd_key || child.id,
        state: 'queued',
        startedAt: null,
        completedAt: null,
        worktreePath: null,
        reason: null
      });
    }

    // Metrics tracking
    this.startTime = Date.now();
    this.maxConcurrencyObserved = 0;
    this.events = [];
    this.budgetUsed = 0;
    this.budgetExceeded = false;
  }

  /**
   * Get the initial scheduling decision.
   * Returns children that can be started immediately.
   *
   * @returns {SchedulingDecision}
   */
  getInitialSchedule() {
    return this._computeSchedule();
  }

  /**
   * Record that a child has been started (teammate spawned).
   *
   * @param {string} childId - Child SD ID
   * @param {string} [worktreePath] - Path to the child's worktree
   */
  markStarted(childId, worktreePath = null) {
    const entry = this.children.get(childId);
    if (!entry) return;

    entry.state = 'running';
    entry.startedAt = Date.now();
    entry.worktreePath = worktreePath;

    this._emitEvent('child_started', { childId, sdKey: entry.sdKey, worktreePath });

    // Update max concurrency metric
    const runningCount = this._countByState('running');
    if (runningCount > this.maxConcurrencyObserved) {
      this.maxConcurrencyObserved = runningCount;
    }
  }

  /**
   * Record that a child has completed.
   * Recomputes the schedule and returns newly runnable children.
   *
   * @param {string} childId - Child SD ID
   * @param {'succeeded'|'failed'|'canceled'} status - Completion status
   * @param {Object} [details] - Additional details (duration, tokens used, etc.)
   * @returns {SchedulingDecision}
   */
  onChildComplete(childId, status, details = {}) {
    const entry = this.children.get(childId);
    if (!entry) {
      return this._computeSchedule();
    }

    entry.state = status;
    entry.completedAt = Date.now();
    entry.reason = details.reason || null;

    // Track budget
    if (details.tokensUsed) {
      this.budgetUsed += details.tokensUsed;
    }

    const durationMs = entry.startedAt ? entry.completedAt - entry.startedAt : 0;

    this._emitEvent('child_completed', {
      childId,
      sdKey: entry.sdKey,
      status,
      durationMs,
      tokensUsed: details.tokensUsed || 0
    });

    return this._computeSchedule();
  }

  /**
   * Get current state of all children.
   *
   * @returns {{ running: ChildEntry[], queued: ChildEntry[], succeeded: ChildEntry[], failed: ChildEntry[], skipped: ChildEntry[], canceled: ChildEntry[] }}
   */
  getState() {
    const result = { running: [], queued: [], succeeded: [], failed: [], skipped: [], canceled: [] };

    for (const entry of this.children.values()) {
      if (result[entry.state]) {
        result[entry.state].push({ ...entry });
      }
    }

    return result;
  }

  /**
   * Get final run summary with metrics.
   *
   * @returns {Object} Run summary
   */
  getRunSummary() {
    const wallTimeMs = Date.now() - this.startTime;
    const state = this.getState();

    // Compute sum of child durations for speedup calculation
    let totalChildDurationMs = 0;
    for (const entry of this.children.values()) {
      if (entry.startedAt && entry.completedAt) {
        totalChildDurationMs += entry.completedAt - entry.startedAt;
      }
    }

    const speedupRatio = wallTimeMs > 0
      ? Math.round((totalChildDurationMs / wallTimeMs) * 100) / 100
      : 1;

    return {
      runId: this.config.runId,
      parallelEnabled: this.config.parallelEnabled,
      maxConcurrencyConfig: this.config.maxConcurrency,
      wallTimeMs,
      totalChildDurationMs,
      maxConcurrencyObserved: this.maxConcurrencyObserved,
      speedupRatio,
      children: {
        total: this.children.size,
        succeeded: state.succeeded.length,
        failed: state.failed.length,
        skipped: state.skipped.length,
        canceled: state.canceled.length,
        running: state.running.length,
        queued: state.queued.length
      },
      budget: {
        configured: this.config.costBudget,
        used: this.budgetUsed,
        exceeded: this.budgetExceeded
      },
      events: this.events,
      dagErrors: this.dagErrors
    };
  }

  /**
   * Check if all children are in terminal state.
   * @returns {boolean}
   */
  isComplete() {
    for (const entry of this.children.values()) {
      if (entry.state === 'queued' || entry.state === 'running') {
        return false;
      }
    }
    return true;
  }

  // ── Internal methods ──

  /**
   * Compute the next scheduling decision based on current state.
   * @returns {SchedulingDecision}
   * @private
   */
  _computeSchedule() {
    const completedIds = new Set();
    const failedIds = new Set();
    const runningIds = new Set();

    for (const [id, entry] of this.children) {
      if (entry.state === 'succeeded') completedIds.add(id);
      if (entry.state === 'failed' || entry.state === 'canceled') failedIds.add(id);
      if (entry.state === 'running') runningIds.add(id);
    }

    // Also treat 'skipped' as failed for dependency propagation
    for (const [id, entry] of this.children) {
      if (entry.state === 'skipped') failedIds.add(id);
    }

    const { runnable, blocked, terminal } = computeRunnableSet(
      this.dag, completedIds, failedIds, runningIds
    );

    // Mark terminal children as skipped
    const toSkip = [];
    for (const { id, reason } of terminal) {
      const entry = this.children.get(id);
      if (entry && entry.state === 'queued') {
        entry.state = 'skipped';
        entry.completedAt = Date.now();
        entry.reason = reason;
        toSkip.push(id);

        this._emitEvent('child_skipped', {
          childId: id,
          sdKey: entry.sdKey,
          reason
        });
      }
    }

    // Determine how many slots are available
    const runningCount = this._countByState('running');
    const availableSlots = Math.max(0, this.config.maxConcurrency - runningCount);

    // Check budget
    let budgetAllowsMore = true;
    if (this.config.costBudget !== null && this.budgetUsed >= this.config.costBudget) {
      this.budgetExceeded = true;
      budgetAllowsMore = false;
      this._emitEvent('budget_exceeded', {
        budgetUsed: this.budgetUsed,
        budgetConfigured: this.config.costBudget,
        remainingQueued: runnable.length
      });
    }

    // Pick children to start (up to available slots)
    const toStart = budgetAllowsMore
      ? runnable.slice(0, availableSlots)
      : [];

    // All terminal if no children are queued/running and nothing new to start
    const allTerminal = this.isComplete() && toStart.length === 0;

    return {
      toStart,
      toSkip,
      allTerminal,
      summary: {
        running: runningCount + toStart.length,
        queued: runnable.length - toStart.length + blocked.length,
        completed: completedIds.size,
        failed: failedIds.size,
        skipped: toSkip.length
      }
    };
  }

  /**
   * Count children in a given state.
   * @param {ChildState} state
   * @returns {number}
   * @private
   */
  _countByState(state) {
    let count = 0;
    for (const entry of this.children.values()) {
      if (entry.state === state) count++;
    }
    return count;
  }

  /**
   * Emit a structured event for observability.
   * @param {string} type
   * @param {Object} data
   * @private
   */
  _emitEvent(type, data) {
    this.events.push({
      type,
      runId: this.config.runId,
      timestamp: new Date().toISOString(),
      ...data
    });
  }
}

/**
 * Create a ParallelCoordinator from environment config.
 * Convenience factory for use in orchestrator scripts.
 *
 * @param {Array} children - Child SD records from database
 * @param {Object} [overrides] - Config overrides
 * @returns {ParallelCoordinator}
 */
export function createCoordinator(children, overrides = {}) {
  return new ParallelCoordinator(children, overrides);
}

export default { ParallelCoordinator, createCoordinator };
