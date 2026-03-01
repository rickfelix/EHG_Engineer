/**
 * Concurrent Venture Orchestrator
 *
 * Manages parallel execution of multiple ventures through the
 * EVA lifecycle. Enforces concurrency limits, tracks active
 * ventures, and provides isolation between concurrent runs.
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-K
 *
 * @module lib/eva/concurrent-venture-orchestrator
 */

import { randomUUID } from 'crypto';
import { classifyEvent, sortByUrgency, TRIGGER_TYPE } from './orchestrator-trigger-types.js';

// Lazy import to avoid circular dependency chains during testing
let _processStage;
async function getProcessStage() {
  if (!_processStage) {
    const mod = await import('./eva-orchestrator.js');
    _processStage = mod.processStage;
  }
  return _processStage;
}

// ── Constants ────────────────────────────────────────────

const DEFAULT_MAX_CONCURRENT = 20;
const DEFAULT_VENTURE_TIMEOUT_MS = 300_000; // 5 minutes per stage

// ── ConcurrentVentureOrchestrator ───────────────────────

export class ConcurrentVentureOrchestrator {
  /**
   * @param {Object} deps
   * @param {Object} deps.supabase - Supabase client
   * @param {Object} [deps.logger] - Logger
   * @param {Object} [deps.config] - Configuration
   */
  constructor(deps = {}) {
    this.supabase = deps.supabase;
    this.logger = deps.logger || console;
    this.maxConcurrent = deps.config?.maxConcurrent || DEFAULT_MAX_CONCURRENT;
    this.ventureTimeoutMs = deps.config?.ventureTimeoutMs || DEFAULT_VENTURE_TIMEOUT_MS;

    /** @type {Map<string, {ventureId: string, stageId: number, startedAt: string, retryCount: number, promise: Promise}>} */
    this.activeVentures = new Map();

    /** @type {Map<string, {ventureId: string, error: string, failedAt: string, retryCount: number}>} */
    this._failureHistory = new Map();

    /** @type {Array<{ventureId: string, stageId: number, triggerType: string, priority: number}>} */
    this.pendingQueue = [];

    this.instanceId = `concurrent-${randomUUID().slice(0, 8)}`;
    this._totalDispatched = 0;
    this._totalCompleted = 0;
    this._totalFailed = 0;
  }

  /**
   * Get the number of currently active ventures.
   * @returns {number}
   */
  get activeCount() {
    return this.activeVentures.size;
  }

  /**
   * Get the number of pending items in the queue.
   * @returns {number}
   */
  get pendingCount() {
    return this.pendingQueue.length;
  }

  /**
   * Check if a venture is currently being processed.
   * @param {string} ventureId
   * @returns {boolean}
   */
  isActive(ventureId) {
    return this.activeVentures.has(ventureId);
  }

  /**
   * Enqueue a venture stage for processing.
   * Respects concurrency limits and trigger type urgency.
   *
   * @param {Object} params
   * @param {string} params.ventureId
   * @param {number} [params.stageId]
   * @param {string} [params.eventType] - For trigger type classification
   * @param {Object} [params.options] - Options to pass to processStage
   * @returns {Promise<Object>} Result when processed
   */
  async enqueue({ ventureId, stageId, eventType, options = {} }) {
    const triggerType = eventType ? classifyEvent(eventType) : TRIGGER_TYPE.PRIORITY_QUEUE;

    // If venture is already active, queue it
    if (this.isActive(ventureId)) {
      this.logger.log(`[ConcurrentOrch] Venture ${ventureId} already active, queuing stage ${stageId}`);
      return new Promise((resolve, reject) => {
        this.pendingQueue.push({
          ventureId,
          stageId,
          triggerType,
          priority: triggerType === TRIGGER_TYPE.EVENT ? 0 : triggerType === TRIGGER_TYPE.ROUND ? 1 : 2,
          options,
          resolve,
          reject,
        });
        this._sortQueue();
      });
    }

    // If under concurrency limit, process immediately
    if (this.activeCount < this.maxConcurrent) {
      return this._dispatch(ventureId, stageId, options);
    }

    // Otherwise queue it
    this.logger.log(`[ConcurrentOrch] At capacity (${this.activeCount}/${this.maxConcurrent}), queuing venture ${ventureId}`);
    return new Promise((resolve, reject) => {
      this.pendingQueue.push({
        ventureId,
        stageId,
        triggerType,
        priority: triggerType === TRIGGER_TYPE.EVENT ? 0 : triggerType === TRIGGER_TYPE.ROUND ? 1 : 2,
        options,
        resolve,
        reject,
      });
      this._sortQueue();
    });
  }

  /**
   * Process multiple ventures concurrently.
   * @param {Array<{ventureId: string, stageId?: number, options?: Object}>} ventures
   * @returns {Promise<Array<Object>>} Results
   */
  async processBatch(ventures) {
    const results = await Promise.allSettled(
      ventures.map(v => this.enqueue(v))
    );

    return results.map((r, i) => ({
      ventureId: ventures[i].ventureId,
      status: r.status,
      result: r.status === 'fulfilled' ? r.value : null,
      error: r.status === 'rejected' ? r.reason?.message : null,
    }));
  }

  /**
   * Get current orchestrator status.
   * @returns {Object}
   */
  getStatus() {
    return {
      instanceId: this.instanceId,
      activeCount: this.activeCount,
      pendingCount: this.pendingCount,
      maxConcurrent: this.maxConcurrent,
      totalDispatched: this._totalDispatched,
      totalCompleted: this._totalCompleted,
      totalFailed: this._totalFailed,
      activeVentures: Array.from(this.activeVentures.entries()).map(([id, v]) => ({
        ventureId: v.ventureId,
        stageId: v.stageId,
        startedAt: v.startedAt,
        elapsedMs: Date.now() - new Date(v.startedAt).getTime(),
      })),
    };
  }

  /**
   * Dispose of all state — cancel pending queue, clear maps.
   * SD-MAN-GEN-CORRECTIVE-VISION-GAP-013 (V05): Explicit cleanup for orchestrator lifecycle.
   */
  dispose() {
    // Reject all pending queue items
    for (const pending of this.pendingQueue) {
      pending.reject(new Error('Orchestrator disposed'));
    }
    this.pendingQueue = [];
    this.activeVentures.clear();
    this._failureHistory.clear();
    this.logger.log(`[ConcurrentOrch] ${this.instanceId} disposed`);
  }

  // ── Private ──────────────────────────────────────────

  async _dispatch(ventureId, stageId, options = {}) {
    const startedAt = new Date().toISOString();
    this._totalDispatched++;

    // SD-MAN-GEN-CORRECTIVE-VISION-GAP-013 (V05): Track retry count from failure history
    const previousFailure = this._failureHistory.get(ventureId);
    const retryCount = previousFailure ? previousFailure.retryCount + 1 : 0;

    const processStageFn = await getProcessStage();
    const promise = processStageFn(
      { ventureId, stageId, options },
      { supabase: this.supabase, logger: this.logger }
    );

    this.activeVentures.set(ventureId, {
      ventureId,
      stageId,
      startedAt,
      retryCount,
      promise,
    });

    this.logger.log(`[ConcurrentOrch] Dispatched venture ${ventureId} stage ${stageId} (${this.activeCount}/${this.maxConcurrent} active${retryCount > 0 ? `, retry ${retryCount}` : ''})`);

    try {
      const result = await promise;
      this._totalCompleted++;
      this._failureHistory.delete(ventureId); // Clear failure history on success
      return result;
    } catch (err) {
      this._totalFailed++;
      this._failureHistory.set(ventureId, {
        ventureId,
        error: err.message,
        failedAt: new Date().toISOString(),
        retryCount,
      });
      throw err;
    } finally {
      this.activeVentures.delete(ventureId);
      this._drainQueue();
    }
  }

  _sortQueue() {
    this.pendingQueue.sort((a, b) => a.priority - b.priority);
  }

  _drainQueue() {
    while (this.pendingQueue.length > 0 && this.activeCount < this.maxConcurrent) {
      const next = this.pendingQueue.shift();
      if (!next) break;

      // Don't dispatch if venture is already active
      if (this.isActive(next.ventureId)) {
        this.pendingQueue.unshift(next);
        break;
      }

      this._dispatch(next.ventureId, next.stageId, next.options)
        .then(next.resolve)
        .catch(next.reject);
    }
  }
}
