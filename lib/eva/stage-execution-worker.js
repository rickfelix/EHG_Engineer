/**
 * Stage Execution Worker — Polling-Based Pipeline Runner
 *
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-D
 *
 * Wraps processStage() from eva-orchestrator.js to auto-advance ventures
 * through stages 1-25, pausing at chairman gates and blocking boundaries.
 *
 * Key responsibilities:
 *   - Poll ventures table for ventures needing stage advancement
 *   - Acquire/release orchestrator processing locks (concurrency safety)
 *   - Handle chairman gate blocking (stages 3, 5, 10, 22, 23, 24)
 *   - Enforce operating mode boundaries (EVALUATION → STRATEGY → PLANNING → BUILD → LAUNCH)
 *   - Propagate kill signals via AbortController per venture
 *   - Retry failed stages with backoff
 *
 * @module lib/eva/stage-execution-worker
 */

import { processStage } from './eva-orchestrator.js';
import {
  acquireProcessingLock,
  releaseProcessingLock,
  markCompleted,
  ORCHESTRATOR_STATES,
} from './orchestrator-state-machine.js';
import {
  createOrReusePendingDecision,
  waitForDecision,
} from './chairman-decision-watcher.js';
import { emit } from './shared-services.js';
import { checkAutonomy } from './autonomy-model.js';

import { hostname } from 'os';
import { createServer } from 'http';

// ── Constants ───────────────────────────────────────────────

const MAX_STAGE = 25;
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const DEFAULT_GATE_TIMEOUT_MS = 0; // 0 = wait indefinitely
const DEFAULT_STALE_LOCK_THRESHOLD_MS = 300_000; // 5 minutes
const DEFAULT_STALL_THRESHOLD_MS = 300_000; // 5 minutes
const DEFAULT_HEALTH_PORT = 3001;
const WORKER_VERSION = '1.1.0';

/**
 * Chairman gate stages where pipeline pauses for human decision.
 * Blocking: pipeline waits for approved/rejected.
 * Advisory: notification sent, pipeline continues.
 */
const CHAIRMAN_GATES = Object.freeze({
  // Subset of frontend gates that block the worker pipeline.
  // Frontend KILL_GATE_STAGES [3, 5, 13, 23] + PROMOTION_GATE_STAGES [10, 16, 17, 22, 24]
  // Stages 13, 16, 17 are handled by operating mode boundaries, not worker blocking.
  BLOCKING: new Set([3, 5, 10, 22, 23, 24]),
  ADVISORY: new Set([]),
});

/**
 * Review-mode stages: worker pauses for chairman review before auto-advancing.
 * Stage 10 is already a BLOCKING gate, so it doesn't need review mode.
 * Synced with frontend: venture-workflow.ts reviewMode === 'review'
 */
const REVIEW_MODE_STAGES = new Set([7, 8, 9, 11]);

/**
 * Operating mode boundaries — entering a new mode requires all prior
 * stages in the previous mode to be complete.
 */
const OPERATING_MODES = Object.freeze({
  EVALUATION: { start: 1, end: 5 },
  STRATEGY:   { start: 6, end: 12 },
  PLANNING:   { start: 13, end: 16 },
  BUILD:      { start: 17, end: 21 },
  LAUNCH:     { start: 22, end: 25 },
});

/**
 * Get the operating mode for a given stage number.
 * @param {number} stage
 * @returns {string} Mode name
 */
function getOperatingMode(stage) {
  for (const [mode, range] of Object.entries(OPERATING_MODES)) {
    if (stage >= range.start && stage <= range.end) return mode;
  }
  return 'UNKNOWN';
}

/**
 * Format milliseconds into human-readable duration (e.g., "2m 30s").
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSec = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSec}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return `${hours}h ${remainingMin}m`;
}

// ── StageExecutionWorker Class ──────────────────────────────

export class StageExecutionWorker {
  /**
   * @param {Object} options
   * @param {Object} options.supabase - Supabase client
   * @param {Object} [options.logger] - Logger (defaults to console)
   * @param {number} [options.pollIntervalMs] - Polling interval in ms
   * @param {number} [options.maxRetries] - Max retries per stage on failure
   * @param {number} [options.retryDelayMs] - Base delay between retries
   * @param {number} [options.gateTimeoutMs] - Timeout for chairman gate decisions (0 = infinite)
   * @param {string} [options.chairmanId] - Chairman ID for preference loading
   * @param {boolean} [options.dryRun] - Skip persistence and transitions
   * @param {boolean} [options.waitForReview] - Block on REQUIRE_REVIEW decisions
   */
  constructor(options = {}) {
    if (!options.supabase) throw new Error('supabase client is required');

    this._supabase = options.supabase;
    this._logger = options.logger || console;
    this._pollIntervalMs = options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    this._maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this._retryDelayMs = options.retryDelayMs || DEFAULT_RETRY_DELAY_MS;
    this._gateTimeoutMs = options.gateTimeoutMs ?? DEFAULT_GATE_TIMEOUT_MS;
    this._chairmanId = options.chairmanId || null;
    this._dryRun = options.dryRun || false;
    this._waitForReview = options.waitForReview || false;
    this._staleLockThresholdMs = options.staleLockThresholdMs ?? DEFAULT_STALE_LOCK_THRESHOLD_MS;

    /** @type {string} Unique worker identity for heartbeats and lock ownership */
    this._workerId = `sew-${hostname()}-${process.pid}`;

    /** @type {Map<string, AbortController>} Active ventures → abort controllers */
    this._activeVentures = new Map();

    /** @type {NodeJS.Timeout|null} */
    this._pollTimer = null;

    /** @type {boolean} */
    this._running = false;

    /** @type {boolean} */
    this._processing = false;

    /** @type {Date} Worker start time */
    this._startedAt = null;

    /** @type {Date|null} Last successful tick timestamp */
    this._lastTickAt = null;

    /** @type {number} Total ventures processed */
    this._venturesProcessed = 0;

    /** @type {number} Stall threshold in ms */
    this._stallThresholdMs = options.stallThresholdMs
      ?? parseInt(process.env.STALL_THRESHOLD_MS || String(DEFAULT_STALL_THRESHOLD_MS), 10);

    /** @type {import('http').Server|null} Health check HTTP server */
    this._healthServer = null;
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Start the polling loop.
   * Idempotent: calling start() when already running is a no-op.
   */
  start() {
    if (this._running) {
      this._logger.warn('[Worker] Already running');
      return;
    }

    this._running = true;
    this._startedAt = new Date();
    this._logger.log(`[Worker] Started (poll every ${this._pollIntervalMs}ms, dryRun=${this._dryRun}, id=${this._workerId})`);

    // Register heartbeat
    this._upsertHeartbeat('online').catch(err =>
      this._logger.warn(`[Worker] Initial heartbeat failed: ${err.message}`)
    );

    // Run immediately, then on interval
    this._tick();
    this._pollTimer = setInterval(() => this._tick(), this._pollIntervalMs);
  }

  /**
   * Stop the polling loop and abort all active ventures.
   * Graceful: waits for current processing cycle to finish.
   */
  stop() {
    if (!this._running) return;

    this._running = false;
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    // Abort all active ventures
    for (const [ventureId, controller] of this._activeVentures) {
      this._logger.log(`[Worker] Aborting venture ${ventureId}`);
      controller.abort();
    }
    this._activeVentures.clear();

    // Stop health server
    if (this._healthServer) {
      this._healthServer.close();
      this._healthServer = null;
    }

    // Mark heartbeat as stopped
    this._upsertHeartbeat('stopped').catch(err =>
      this._logger.warn(`[Worker] Stop heartbeat failed: ${err.message}`)
    );

    this._logger.log('[Worker] Stopped');
  }

  /**
   * Kill a specific venture's pipeline.
   * Sends abort signal and marks venture as killed.
   *
   * @param {string} ventureId - Venture UUID to kill
   * @param {string} [reason] - Kill reason
   * @returns {Promise<{killed: boolean, error?: string}>}
   */
  async kill(ventureId, reason = 'Manual kill') {
    const controller = this._activeVentures.get(ventureId);
    if (controller) {
      controller.abort();
      this._activeVentures.delete(ventureId);
    }

    try {
      // Mark venture as killed in DB
      const { error } = await this._supabase
        .from('ventures')
        .update({
          status: 'killed',
          orchestrator_state: ORCHESTRATOR_STATES.KILLED_AT_REALITY_GATE,
          orchestrator_lock_id: null,
          orchestrator_lock_acquired_at: null,
          metadata: this._supabase.sql
            ? undefined
            : { kill_reason: reason, killed_at: new Date().toISOString() },
        })
        .eq('id', ventureId);

      if (error) {
        this._logger.error(`[Worker] Kill DB update failed: ${error.message}`);
        return { killed: false, error: error.message };
      }

      await emit(this._supabase, 'venture_killed', {
        ventureId,
        reason,
        killedBy: 'stage-execution-worker',
      }, 'stage-execution-worker').catch(() => {});

      this._logger.log(`[Worker] Venture ${ventureId} killed: ${reason}`);
      return { killed: true };
    } catch (err) {
      this._logger.error(`[Worker] Kill error: ${err.message}`);
      return { killed: false, error: err.message };
    }
  }

  /**
   * Process a single venture through one stage (for direct invocation).
   *
   * @param {string} ventureId - Venture UUID
   * @returns {Promise<Object>} Stage result from processStage()
   */
  async processOneStage(ventureId) {
    const wasRunning = this._running;
    this._running = true;
    try {
      return await this._processVenture(ventureId);
    } finally {
      this._running = wasRunning;
    }
  }

  /**
   * Get active venture count and IDs.
   * @returns {{ count: number, ventureIds: string[] }}
   */
  getStatus() {
    return {
      running: this._running,
      processing: this._processing,
      activeVentures: this._activeVentures.size,
      ventureIds: Array.from(this._activeVentures.keys()),
    };
  }

  /**
   * Get health status including stall detection.
   *
   * @returns {{ status: string, uptime: number, startedAt: string|null, lastTickAt: string|null, venturesProcessed: number, version: string, workerId: string, timeSinceLastTick: string|null, stalled: boolean }}
   */
  getHealth() {
    const now = Date.now();
    const uptimeMs = this._startedAt ? now - this._startedAt.getTime() : 0;
    const timeSinceLastTickMs = this._lastTickAt ? now - this._lastTickAt.getTime() : null;
    const stalled = this._running && timeSinceLastTickMs !== null && timeSinceLastTickMs > this._stallThresholdMs;

    let status = 'healthy';
    if (!this._running) status = 'stopped';
    else if (stalled) status = 'degraded';

    return {
      status,
      uptime: Math.round(uptimeMs / 1000),
      startedAt: this._startedAt?.toISOString() || null,
      lastTickAt: this._lastTickAt?.toISOString() || null,
      venturesProcessed: this._venturesProcessed,
      version: WORKER_VERSION,
      workerId: this._workerId,
      timeSinceLastTick: timeSinceLastTickMs !== null
        ? formatDuration(timeSinceLastTickMs)
        : null,
      stalled,
      activeVentures: this._activeVentures.size,
      pollIntervalMs: this._pollIntervalMs,
      stallThresholdMs: this._stallThresholdMs,
    };
  }

  /**
   * Start an HTTP health check server.
   *
   * @param {number} [port] - Port to listen on (default: HEALTH_PORT env or 3001)
   * @returns {Promise<import('http').Server>}
   */
  startHealthServer(port) {
    const listenPort = port ?? parseInt(process.env.HEALTH_PORT || String(DEFAULT_HEALTH_PORT), 10);

    return new Promise((resolve, reject) => {
      this._healthServer = createServer((req, res) => {
        if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
          const health = this.getHealth();
          const statusCode = health.status === 'degraded' ? 503 : 200;
          res.writeHead(statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(health));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });

      this._healthServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          this._logger.warn(`[Worker] Health port ${listenPort} in use, skipping health server`);
          this._healthServer = null;
          resolve(null);
        } else {
          reject(err);
        }
      });

      this._healthServer.listen(listenPort, () => {
        this._logger.log(`[Worker] Health endpoint listening on http://localhost:${listenPort}/health`);
        resolve(this._healthServer);
      });
    });
  }

  // ── Internal Methods ────────────────────────────────────

  /**
   * Single polling tick: find ventures needing work and process them.
   * Skips if already processing (prevents concurrent poll overlap).
   */
  async _tick() {
    if (this._processing || !this._running) return;

    this._processing = true;
    try {
      this._lastTickAt = new Date();

      // Heartbeat + stale lock cleanup before polling
      await this._upsertHeartbeat('online').catch(err =>
        this._logger.warn(`[Worker] Heartbeat failed: ${err.message}`)
      );
      await this._releaseStaleLocks();

      const ventures = await this._pollForWork();
      if (ventures.length === 0) return;

      this._logger.log(`[Worker] Found ${ventures.length} venture(s) to process`);

      // Process sequentially to respect lock semantics
      for (const venture of ventures) {
        if (!this._running) break;
        await this._processVenture(venture.id);
      }
    } catch (err) {
      this._logger.error(`[Worker] Tick error: ${err.message}`);
    } finally {
      this._processing = false;
    }
  }

  /**
   * Query ventures table for ventures ready for stage advancement.
   *
   * Ready means: status=active, orchestrator_state=idle, current_lifecycle_stage < 25.
   *
   * @returns {Promise<Array<{id: string, name: string, current_lifecycle_stage: number}>>}
   */
  async _pollForWork() {
    try {
      const { data, error } = await this._supabase
        .from('ventures')
        .select('id, name, current_lifecycle_stage')
        .eq('status', 'active')
        .eq('orchestrator_state', ORCHESTRATOR_STATES.IDLE)
        .lt('current_lifecycle_stage', MAX_STAGE)
        .order('current_lifecycle_stage', { ascending: true });

      if (error) {
        this._logger.error(`[Worker] Poll query failed: ${error.message}`);
        return [];
      }

      return data || [];
    } catch (err) {
      this._logger.error(`[Worker] Poll error: ${err.message}`);
      return [];
    }
  }

  /**
   * Process a single venture: acquire lock → advance stages → release lock.
   *
   * Advances sequentially within the current operating mode until:
   *   - A chairman gate blocks progress
   *   - A stage fails (with retries exhausted)
   *   - The filter engine returns STOP or REQUIRE_REVIEW
   *   - An operating mode boundary is reached
   *   - Stage 25 is completed (venture lifecycle finished)
   *   - AbortController signal is triggered (kill)
   *
   * @param {string} ventureId - Venture UUID
   * @returns {Promise<Object>} Last stage result
   */
  async _processVenture(ventureId) {
    // 1. Acquire processing lock
    const { acquired, lockId, error: lockError } = await acquireProcessingLock(
      this._supabase, ventureId, { logger: this._logger }
    );

    if (!acquired) {
      this._logger.log(`[Worker] Skipping ${ventureId}: ${lockError || 'lock not acquired'}`);
      return { ventureId, status: 'skipped', reason: lockError };
    }

    // 2. Create AbortController for this venture
    const controller = new AbortController();
    this._activeVentures.set(ventureId, controller);

    let lastResult = null;
    let releaseState = ORCHESTRATOR_STATES.IDLE;

    try {
      // 3. Get current stage
      const { data: venture, error: fetchError } = await this._supabase
        .from('ventures')
        .select('current_lifecycle_stage, name')
        .eq('id', ventureId)
        .single();

      if (fetchError || !venture) {
        this._logger.error(`[Worker] Failed to fetch venture ${ventureId}: ${fetchError?.message}`);
        releaseState = ORCHESTRATOR_STATES.FAILED;
        return { ventureId, status: 'error', reason: fetchError?.message };
      }

      let currentStage = venture.current_lifecycle_stage || 1;
      const startMode = getOperatingMode(currentStage);
      this._venturesProcessed++;
      this._logger.log(`[Worker] Processing ${venture.name || ventureId} from stage ${currentStage} (${startMode})`);

      // 4. Sequential stage advancement loop
      while (currentStage <= MAX_STAGE && this._running) {
        // Check abort signal
        if (controller.signal.aborted) {
          this._logger.log(`[Worker] Venture ${ventureId} aborted at stage ${currentStage}`);
          releaseState = ORCHESTRATOR_STATES.IDLE;
          break;
        }

        // Check operating mode boundary: if we crossed into a new mode, pause
        const currentMode = getOperatingMode(currentStage);
        if (currentMode !== startMode && currentStage > venture.current_lifecycle_stage) {
          this._logger.log(`[Worker] Mode boundary reached: ${startMode} → ${currentMode} at stage ${currentStage}`);
          releaseState = ORCHESTRATOR_STATES.IDLE;
          break;
        }

        // Execute the stage with retries
        const stageStartMs = Date.now();
        const result = await this._executeWithRetry(ventureId, currentStage);
        const stageDurationMs = Date.now() - stageStartMs;
        lastResult = result;

        // Write-through to venture_stage_work so the UI can display results.
        // processStage() writes to venture_artifacts but not venture_stage_work,
        // while the frontend reads advisory_data from venture_stage_work.
        // MUST await — fire-and-forget caused stage_status to stay 'in_progress'
        // for completed stages, breaking frontend currentStage detection.
        try {
          await this._syncStageWork(ventureId, currentStage, result);
        } catch (err) {
          this._logger.warn(`[Worker] venture_stage_work sync failed (non-fatal): ${err.message}`);
        }

        // Review-mode stages: pause for chairman review before auto-advancing
        if (REVIEW_MODE_STAGES.has(currentStage) && !CHAIRMAN_GATES.BLOCKING.has(currentStage)) {
          this._logger.log(`[Worker] Review-mode stage ${currentStage} — blocking for chairman review`);

          // Create a chairman_decisions row with decision_type = 'review'
          try {
            const { data: ventureForReview } = await this._supabase
              .from('ventures')
              .select('name')
              .eq('id', ventureId)
              .single();

            await this._supabase.from('chairman_decisions').insert({
              venture_id: ventureId,
              lifecycle_stage: currentStage,
              decision_type: 'review',
              status: 'pending',
              summary: `Review: Stage ${currentStage} complete for ${ventureForReview?.name || ventureId}`,
              brief_data: { stage: currentStage, ventureName: ventureForReview?.name },
            });
          } catch (err) {
            this._logger.warn(`[Worker] Review decision creation failed (non-fatal): ${err.message}`);
          }

          this._logStageTransition(ventureId, currentStage, 'completed', stageDurationMs, result).catch(() => {});
          releaseState = ORCHESTRATOR_STATES.BLOCKED;
          lastResult = { ventureId, stageId: currentStage, status: 'blocked', gate: 'review' };
          break;
        }

        // Check chairman gate AFTER stage execution so validation data
        // is available for the user to review before approving/rejecting.
        if (CHAIRMAN_GATES.BLOCKING.has(currentStage)) {
          // processStage() may have already advanced current_lifecycle_stage
          // to the next stage via its internal filter engine.  Revert it back
          // to the current (gate) stage so the venture stays at the gate until
          // the chairman approves.
          await this._supabase
            .from('ventures')
            .update({ current_lifecycle_stage: currentStage })
            .eq('id', ventureId);

          const gateResult = await this._handleChairmanGate(ventureId, currentStage);
          if (gateResult.blocked) {
            this._logger.log(`[Worker] Blocked at chairman gate stage ${currentStage} (post-execution)`);
            this._logStageTransition(ventureId, currentStage, 'completed', stageDurationMs, result).catch(() => {});
            releaseState = ORCHESTRATOR_STATES.BLOCKED;
            lastResult = { ventureId, stageId: currentStage, status: 'blocked', gate: 'chairman' };
            break;
          }
          if (gateResult.killed) {
            this._logger.log(`[Worker] Killed at chairman gate stage ${currentStage}`);
            releaseState = ORCHESTRATOR_STATES.KILLED_AT_REALITY_GATE;
            lastResult = { ventureId, stageId: currentStage, status: 'killed' };
            break;
          }
          // approved — continue processing
        }

        const resultStatus = (result?.status || '').toUpperCase();
        if (!result || resultStatus === 'FAILED') {
          this._logger.error(`[Worker] Stage ${currentStage} failed for ${ventureId} after retries`);
          this._logStageTransition(ventureId, currentStage, 'failed', stageDurationMs, result).catch(() => {});
          releaseState = ORCHESTRATOR_STATES.FAILED;
          break;
        }

        if (resultStatus === 'BLOCKED') {
          this._logger.log(`[Worker] Stage ${currentStage} blocked for ${ventureId}`);
          this._logStageTransition(ventureId, currentStage, 'blocked', stageDurationMs, result).catch(() => {});
          releaseState = ORCHESTRATOR_STATES.BLOCKED;
          break;
        }

        // Log successful stage transition
        this._logStageTransition(ventureId, currentStage, 'completed', stageDurationMs, result).catch(() => {});

        // Check filter decision
        if (result.filterDecision?.action === 'STOP') {
          this._logger.log(`[Worker] Filter STOP at stage ${currentStage}`);
          releaseState = ORCHESTRATOR_STATES.BLOCKED;
          break;
        }

        if (result.filterDecision?.action === 'REQUIRE_REVIEW' && !this._waitForReview) {
          this._logger.log(`[Worker] Review required at stage ${currentStage}, pausing`);
          releaseState = ORCHESTRATOR_STATES.BLOCKED;
          break;
        }

        // Check for lifecycle completion
        if (currentStage >= MAX_STAGE || !result.nextStageId) {
          this._logger.log(`[Worker] Venture ${ventureId} completed lifecycle at stage ${currentStage}`);
          await markCompleted(this._supabase, ventureId, { lockId, logger: this._logger });
          this._activeVentures.delete(ventureId);
          return lastResult;
        }

        // Advance to next stage
        currentStage = result.nextStageId;
      }
    } catch (err) {
      this._logger.error(`[Worker] Venture ${ventureId} error: ${err.message}`);
      releaseState = ORCHESTRATOR_STATES.FAILED;
      lastResult = { ventureId, status: 'error', error: err.message };
    } finally {
      // Release lock (unless markCompleted already handled it)
      this._activeVentures.delete(ventureId);
      const { state: currentState } = await import('./orchestrator-state-machine.js')
        .then(m => m.getOrchestratorState(this._supabase, ventureId))
        .catch(() => ({ state: ORCHESTRATOR_STATES.PROCESSING }));

      if (currentState === ORCHESTRATOR_STATES.PROCESSING) {
        await releaseProcessingLock(this._supabase, ventureId, {
          lockId,
          targetState: releaseState,
          logger: this._logger,
        });
      }
    }

    return lastResult;
  }

  /**
   * Execute a single stage with retry logic.
   *
   * @param {string} ventureId
   * @param {number} stageNumber
   * @returns {Promise<Object>} Stage result
   */
  async _executeWithRetry(ventureId, stageNumber) {
    let lastError = null;

    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this._retryDelayMs * Math.pow(2, attempt - 1);
        this._logger.log(`[Worker] Retry ${attempt}/${this._maxRetries} for stage ${stageNumber} (delay ${delay}ms)`);
        await this._sleep(delay);
      }

      try {
        const result = await processStage(
          {
            ventureId,
            stageId: stageNumber,
            options: {
              autoProceed: true,
              dryRun: this._dryRun,
              chairmanId: this._chairmanId,
              waitForReview: this._waitForReview,
            },
          },
          {
            supabase: this._supabase,
            logger: this._logger,
          }
        );

        // SUCCESS or BLOCKED — don't retry these (STATUS constants are uppercase)
        const s = (result.status || '').toUpperCase();
        if (s === 'COMPLETED' || s === 'BLOCKED') {
          return result;
        }

        // FAILED — retry if attempts remain
        lastError = result.errors?.[0]?.message || 'Unknown failure';
        this._logger.warn(`[Worker] Stage ${stageNumber} attempt ${attempt + 1} failed: ${lastError}`);
      } catch (err) {
        lastError = err.message;
        this._logger.warn(`[Worker] Stage ${stageNumber} attempt ${attempt + 1} threw: ${lastError}`);
      }
    }

    return {
      ventureId,
      stageId: stageNumber,
      status: 'failed',
      errors: [{ code: 'MAX_RETRIES_EXCEEDED', message: `Failed after ${this._maxRetries + 1} attempts: ${lastError}` }],
    };
  }

  /**
   * Handle chairman gate: create or reuse pending decision, optionally wait.
   *
   * @param {string} ventureId
   * @param {number} stageNumber
   * @returns {Promise<{blocked: boolean, killed: boolean, approved: boolean}>}
   */
  async _handleChairmanGate(ventureId, stageNumber) {
    try {
      // Check autonomy level — L2+ auto-approves blocking chairman gates
      const autonomy = await checkAutonomy(ventureId, 'stage_gate', { supabase: this._supabase });
      if (autonomy.action === 'auto_approve') {
        this._logger.log(`[Worker] Chairman gate ${stageNumber} auto-approved (${autonomy.level})`);
        return { blocked: false, killed: false, approved: true };
      }

      // Fetch brief data for the decision
      const { data: venture } = await this._supabase
        .from('ventures')
        .select('name, metadata')
        .eq('id', ventureId)
        .single();

      const { id: decisionId, isNew } = await createOrReusePendingDecision({
        ventureId,
        stageNumber,
        briefData: { stage: stageNumber, ventureName: venture?.name },
        summary: `Chairman gate: Stage ${stageNumber} review for ${venture?.name || ventureId}`,
        supabase: this._supabase,
        logger: this._logger,
      });

      if (!isNew) {
        // Check if already resolved
        const { data: existing } = await this._supabase
          .from('chairman_decisions')
          .select('status, decision')
          .eq('id', decisionId)
          .single();

        if (existing?.status === 'approved') {
          this._logger.log(`[Worker] Chairman gate ${stageNumber} already approved`);
          return { blocked: false, killed: false, approved: true };
        }
        if (existing?.status === 'rejected' || existing?.decision === 'kill') {
          return { blocked: false, killed: true, approved: false };
        }
      }

      // Emit event for UI notification
      await emit(this._supabase, 'chairman_gate_waiting', {
        ventureId,
        stageNumber,
        decisionId,
      }, 'stage-execution-worker').catch(() => {});

      if (this._gateTimeoutMs === 0) {
        // Non-blocking: signal blocked, don't wait
        return { blocked: true, killed: false, approved: false };
      }

      // Wait for decision with timeout
      try {
        const resolution = await waitForDecision({
          decisionId,
          supabase: this._supabase,
          logger: this._logger,
          timeoutMs: this._gateTimeoutMs,
        });

        if (resolution.status === 'approved') {
          return { blocked: false, killed: false, approved: true };
        }
        if (resolution.decision === 'kill') {
          return { blocked: false, killed: true, approved: false };
        }
        // Rejected or other — block
        return { blocked: true, killed: false, approved: false };
      } catch (err) {
        // Timeout — treat as blocked
        this._logger.warn(`[Worker] Gate timeout at stage ${stageNumber}: ${err.message}`);
        return { blocked: true, killed: false, approved: false };
      }
    } catch (err) {
      this._logger.error(`[Worker] Chairman gate error at stage ${stageNumber}: ${err.message}`);
      return { blocked: true, killed: false, approved: false };
    }
  }

  /**
   * Release stale processing locks on ventures that have been locked
   * longer than the threshold. Resets them to idle so they can be
   * picked up on the next poll cycle.
   *
   * FR-001: Stale Lock Auto-Release
   */
  async _releaseStaleLocks() {
    try {
      const cutoff = new Date(Date.now() - this._staleLockThresholdMs).toISOString();

      const { data: stale, error } = await this._supabase
        .from('ventures')
        .select('id, name, orchestrator_lock_acquired_at')
        .eq('orchestrator_state', ORCHESTRATOR_STATES.PROCESSING)
        .lt('orchestrator_lock_acquired_at', cutoff);

      if (error) {
        this._logger.warn(`[Worker] Stale lock query failed: ${error.message}`);
        return;
      }

      if (!stale || stale.length === 0) return;

      for (const venture of stale) {
        const lockAge = Date.now() - new Date(venture.orchestrator_lock_acquired_at).getTime();
        this._logger.warn(
          `[Worker] Releasing stale lock on ${venture.name || venture.id} ` +
          `(locked ${Math.round(lockAge / 1000)}s ago, threshold ${this._staleLockThresholdMs / 1000}s)`
        );

        const { error: resetError } = await this._supabase
          .from('ventures')
          .update({
            orchestrator_state: ORCHESTRATOR_STATES.IDLE,
            orchestrator_lock_id: null,
            orchestrator_lock_acquired_at: null,
          })
          .eq('id', venture.id)
          .eq('orchestrator_state', ORCHESTRATOR_STATES.PROCESSING);

        if (resetError) {
          this._logger.error(`[Worker] Failed to release stale lock on ${venture.id}: ${resetError.message}`);
        } else {
          await emit(this._supabase, 'stale_lock_released', {
            ventureId: venture.id,
            ventureName: venture.name,
            lockAge,
            releasedBy: this._workerId,
          }, 'stage-execution-worker').catch(() => {});
        }
      }
    } catch (err) {
      this._logger.error(`[Worker] Stale lock sweep error: ${err.message}`);
    }
  }

  /**
   * Upsert worker heartbeat to worker_heartbeats table.
   *
   * FR-002: Health Heartbeat
   *
   * @param {'online'|'stopped'|'crashed'} status
   */
  async _upsertHeartbeat(status) {
    const { error } = await this._supabase
      .from('worker_heartbeats')
      .upsert(
        {
          worker_id: this._workerId,
          worker_type: 'stage-execution-worker',
          last_heartbeat_at: new Date().toISOString(),
          status,
          pid: process.pid,
          hostname: hostname(),
          metadata: {
            activeVentures: this._activeVentures.size,
            pollIntervalMs: this._pollIntervalMs,
            uptime: process.uptime(),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'worker_id' }
      );

    if (error) throw new Error(error.message);
  }

  /**
   * Log a stage transition to workflow_executions for observability.
   *
   * SD-MAN-INFRA-VENTURE-ARTIFACT-PIPELINE-003
   *
   * @param {string} ventureId
   * @param {number} stageNumber
   * @param {'completed'|'failed'|'blocked'} status
   * @param {number} durationMs
   * @param {Object} [result]
   */
  async _logStageTransition(ventureId, stageNumber, status, durationMs, result) {
    try {
      const { error } = await this._supabase
        .from('workflow_executions')
        .insert({
          venture_id: ventureId,
          workflow_template_id: 'stage-pipeline',
          current_stage: stageNumber,
          status,
          started_at: new Date(Date.now() - durationMs).toISOString(),
          current_stage_started_at: new Date(Date.now() - durationMs).toISOString(),
          current_stage_data: {
            duration_ms: durationMs,
            operating_mode: getOperatingMode(stageNumber),
            worker_id: this._workerId,
            errors: result?.errors || null,
          },
          next_stage_data: result?.nextStageId ? { next_stage: result.nextStageId } : null,
        });

      if (error) {
        this._logger.warn(`[Worker] Stage transition log failed: ${error.message}`);
      }
    } catch (err) {
      this._logger.warn(`[Worker] Stage transition log error: ${err.message}`);
    }
  }

  /**
   * Sync stage execution results to venture_stage_work so the frontend
   * can display advisory_data and stage_status.
   *
   * processStage() writes to venture_artifacts but not venture_stage_work.
   * The frontend reads advisory_data from venture_stage_work.
   *
   * @param {string} ventureId
   * @param {number} stageNumber
   * @param {Object} result - processStage() return value
   */
  async _syncStageWork(ventureId, stageNumber, result) {
    if (!result) return;

    // Merge artifact payloads into a single advisory_data object
    const advisoryData = {};
    if (result.artifacts && Array.isArray(result.artifacts)) {
      for (const artifact of result.artifacts) {
        const payload = artifact.payload || {};
        // Flatten each artifact's payload into advisory_data
        if (typeof payload === 'object' && !Array.isArray(payload)) {
          Object.assign(advisoryData, payload);
        }
      }
    }

    // Determine stage_status from result
    const resultStatus = (result.status || '').toUpperCase();
    let stageStatus;
    if (resultStatus === 'COMPLETED') stageStatus = 'completed';
    else if (resultStatus === 'BLOCKED') stageStatus = 'blocked';
    else if (resultStatus === 'FAILED') stageStatus = 'failed';
    else stageStatus = 'in_progress';

    // For chairman gate stages, mark as blocked (awaiting chairman approval)
    if (CHAIRMAN_GATES.BLOCKING.has(stageNumber) && stageStatus === 'completed') {
      stageStatus = 'blocked';
    }

    const now = new Date().toISOString();
    const updateData = {
      stage_status: stageStatus,
      advisory_data: Object.keys(advisoryData).length > 0 ? advisoryData : null,
      started_at: result.startedAt || now,
      updated_at: now,
    };

    // Set completed_at for stages that completed (non-gate or approved gate)
    if (stageStatus === 'completed') {
      updateData.completed_at = now;
    }

    const { error } = await this._supabase
      .from('venture_stage_work')
      .update(updateData)
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', stageNumber);

    if (error) {
      this._logger.warn(`[Worker] venture_stage_work update failed for stage ${stageNumber}: ${error.message}`);
    } else {
      this._logger.log(`[Worker] venture_stage_work synced for stage ${stageNumber} (status: ${stageStatus}, advisory_data: ${Object.keys(advisoryData).length} keys)`);
    }
  }

  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ── Convenience Exports ─────────────────────────────────────

export { CHAIRMAN_GATES, REVIEW_MODE_STAGES, OPERATING_MODES, getOperatingMode };

export default StageExecutionWorker;
