/**
 * Stage Execution Worker — Polling-Based Pipeline Runner
 *
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-D
 *
 * Wraps processStage() from eva-orchestrator.js to auto-advance ventures
 * through stages 1-26, pausing at chairman gates and blocking boundaries.
 *
 * Key responsibilities:
 *   - Poll ventures table for ventures needing stage advancement
 *   - Acquire/release orchestrator processing locks (concurrency safety)
 *   - Handle chairman gate blocking (stages 3, 5, 10, 13, 17, 18, 23, 24, 25)
 *   - Enforce operating mode boundaries (EVALUATION → STRATEGY → PLANNING → BUILD → LAUNCH)
 *   - Propagate kill signals via AbortController per venture
 *   - Retry failed stages with backoff
 *   - Track per-stage execution records with heartbeat (SD-VW-BACKEND-EXEC-RECORDS-001)
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
import {
  CHAIRMAN_GATES,
  KILL_GATE_STAGES,
  PROMOTION_GATE_STAGES,
  REVIEW_MODE_STAGES,
  OPERATING_MODES,
} from './gate-constants.js';

// ── Constants ───────────────────────────────────────────────

const MAX_STAGE = 26;
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const DEFAULT_GATE_TIMEOUT_MS = 0; // 0 = wait indefinitely
const DEFAULT_STALE_LOCK_THRESHOLD_MS = 300_000; // 5 minutes
const DEFAULT_STALL_THRESHOLD_MS = 300_000; // 5 minutes
const DEFAULT_HEALTH_PORT = 3001;
const DEFAULT_EXEC_HEARTBEAT_MS = 15_000; // heartbeat every 15s during stage processing
const WORKER_VERSION = '1.2.0';

// Gate constants imported from gate-constants.js (single source of truth)
// CHAIRMAN_GATES, KILL_GATE_STAGES, PROMOTION_GATE_STAGES, REVIEW_MODE_STAGES, OPERATING_MODES

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
    this._execHeartbeatMs = options.execHeartbeatMs ?? DEFAULT_EXEC_HEARTBEAT_MS;

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

    /**
     * SD-LEO-INFRA-CENTRALIZED-POST-STAGE-001: Centralized post-stage hook registry.
     * Hooks fire after ANY advancement path completes a stage, not just one path.
     * @type {Map<number, (ventureId: string) => Promise<void>>}
     */
    this._postStageHookRegistry = new Map([
      [17, (ventureId) => this._postStageHook_S17_DocGen(ventureId)],
      [19, (ventureId) => this._postStageHook_S19_Bridge(ventureId)],
    ]);
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

      // Heartbeat + stale lock/execution cleanup before polling
      await this._upsertHeartbeat('online').catch(err =>
        this._logger.warn(`[Worker] Heartbeat failed: ${err.message}`)
      );
      await this._releaseStaleLocks();
      await this._markStaleExecutions();

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
   * Ready means: status=active, orchestrator_state=idle, current_lifecycle_stage < 26.
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

        // SD-LEO-FEAT-PER-STAGE-AUTO-PROCEED-001: Check Chairman governance override
        const governanceOverride = await this._checkGovernanceOverride(currentStage);
        if (governanceOverride && !governanceOverride.auto_proceed) {
          this._logger.log(`[Worker] Stage ${currentStage} paused by Chairman governance override: ${governanceOverride.reason || 'manual review required'}`);
          releaseState = ORCHESTRATOR_STATES.BLOCKED;
          lastResult = { status: 'governance_hold', stage: currentStage, reason: governanceOverride.reason };
          break;
        }

        // SD-LEO-INFRA-S20-BUILD-PENDING-001-A: BUILD_PENDING — pause at S20
        // when linked SDs exist but are not all terminal (completed/cancelled).
        // This prevents S20 from auto-advancing with LLM-synthesized fake build
        // reports while LEO SDs are still being executed in Claude Code sessions.
        if (currentStage === 20) {
          const buildPendingResult = await this._checkBuildPending(ventureId);
          if (buildPendingResult.blocked) {
            this._logger.log(
              `[Worker] Stage 20 BUILD_PENDING: ${buildPendingResult.nonTerminalCount} non-terminal SD(s) — blocking venture ${ventureId}`
            );
            releaseState = ORCHESTRATOR_STATES.BLOCKED;
            lastResult = {
              ventureId,
              stageId: currentStage,
              status: 'build_pending',
              nonTerminalSDs: buildPendingResult.nonTerminalCount,
              totalSDs: buildPendingResult.totalCount,
              healthScore: buildPendingResult.healthScore,
            };
            break;
          }
          if (buildPendingResult.totalCount > 0 && !buildPendingResult.blocked) {
            this._logger.log(
              `[Worker] Stage 20 BUILD_PENDING: all ${buildPendingResult.totalCount} SD(s) terminal — proceeding with real build data`
            );
          }
          if (buildPendingResult.totalCount === 0) {
            this._logger.log(
              `[Worker] Stage 20 BUILD_PENDING: zero SDs linked to venture ${ventureId} — blocking (bridge did not create SDs)`
            );
            releaseState = ORCHESTRATOR_STATES.BLOCKED;
            lastResult = {
              ventureId,
              stageId: currentStage,
              status: 'build_pending',
              nonTerminalSDs: 0,
              totalSDs: 0,
              healthScore: 'red',
              error: 'No SDs linked to venture — Stage 19 bridge did not create SDs',
            };
            break;
          }
        }

        // P0 Pre-execution guard: if this is a gate/review stage, check for
        // existing decisions BEFORE calling processStage (LLM call).
        const isPreExecGate = REVIEW_MODE_STAGES.has(currentStage) || CHAIRMAN_GATES.BLOCKING.has(currentStage) || await this._isInHardGateStages(currentStage);
        if (isPreExecGate) {
          // Check for pending decision → block without running LLM
          const { data: pendingDecision } = await this._supabase
            .from('chairman_decisions')
            .select('id, status')
            .eq('venture_id', ventureId)
            .eq('lifecycle_stage', currentStage)
            .eq('status', 'pending')
            .limit(1)
            .maybeSingle();

          if (pendingDecision && pendingDecision.status === 'pending') {
            // Check all 3 governance layers (global toggle, hard gates, per-stage overrides)
            const shouldAutoApprove = await this._shouldAutoApproveStage(currentStage);
            if (shouldAutoApprove) {
              this._logger.log(
                `[Worker] Stage ${currentStage} pending decision ${pendingDecision.id} — auto-approving (global_auto_proceed=true)`
              );
              await this._supabase
                .from('chairman_decisions')
                .update({ status: 'approved', decision: 'proceed', blocking: false, updated_at: new Date().toISOString() })
                .eq('id', pendingDecision.id);
              await this._supabase
                .from('venture_stage_work')
                .update({ stage_status: 'completed', completed_at: new Date().toISOString() })
                .eq('venture_id', ventureId)
                .eq('lifecycle_stage', currentStage);
              const nextStage = currentStage + 1;
              await this._supabase
                .from('ventures')
                .update({ current_lifecycle_stage: nextStage })
                .eq('id', ventureId);
              this._logger.log(`[Worker] Advanced DB stage ${currentStage} → ${nextStage} (pending auto-approved)`);
              this._logStageTransition(ventureId, currentStage, 'completed', 0, null).catch(() => {});
              await this._runPostStageHooks(ventureId, currentStage);
              currentStage = nextStage;
              continue;
            }

            this._logger.log(
              `[Worker] Stage ${currentStage} has pending decision ${pendingDecision.id} — skipping execution, remaining blocked`
            );
            releaseState = ORCHESTRATOR_STATES.BLOCKED;
            lastResult = {
              ventureId,
              stageId: currentStage,
              status: 'blocked',
              gate: REVIEW_MODE_STAGES.has(currentStage) ? 'review' : 'chairman',
              pendingDecisionId: pendingDecision.id,
            };
            break;
          }

          // Check for already-approved decision → skip LLM, advance directly.
          // This prevents the infinite re-execution loop: without this check,
          // processStage runs an LLM call on every poll cycle even though the
          // chairman already approved.
          const { data: approvedDecision } = await this._supabase
            .from('chairman_decisions')
            .select('id, status')
            .eq('venture_id', ventureId)
            .eq('lifecycle_stage', currentStage)
            .eq('status', 'approved')
            .limit(1)
            .maybeSingle();

          if (approvedDecision && approvedDecision.status === 'approved') {
            // Check if the stage already has artifacts — if not, we must still run
            // processStage() so the stage output is generated. (Bug 2 fix: QF-20260320-509)
            const { data: existingArtifacts } = await this._supabase
              .from('venture_artifacts')
              .select('id')
              .eq('venture_id', ventureId)
              .eq('lifecycle_stage', currentStage)
              .eq('is_current', true)
              .limit(1);

            if (existingArtifacts && existingArtifacts.length > 0) {
              this._logger.log(
                `[Worker] Stage ${currentStage} already approved (decision ${approvedDecision.id}) + has artifacts — skipping processStage, advancing`
              );
              await this._supabase
                .from('venture_stage_work')
                .update({ stage_status: 'completed', completed_at: new Date().toISOString() })
                .eq('venture_id', ventureId)
                .eq('lifecycle_stage', currentStage);
              const nextStage = currentStage + 1;
              await this._supabase
                .from('ventures')
                .update({ current_lifecycle_stage: nextStage })
                .eq('id', ventureId);
              this._logger.log(`[Worker] Advanced DB stage ${currentStage} → ${nextStage} (pre-execution approved skip)`);
              this._logStageTransition(ventureId, currentStage, 'completed', 0, null).catch(() => {});
              await this._runPostStageHooks(ventureId, currentStage);

              currentStage = nextStage;
              continue;
            }
            // No artifacts yet — fall through to execute processStage() normally
            this._logger.log(
              `[Worker] Stage ${currentStage} approved but no artifacts — executing processStage before advancing`
            );
          }
        }

        // Execute the stage with retries (includes execution record lifecycle + lock refresh)
        const stageStartMs = Date.now();
        const result = await this._executeWithRetry(ventureId, currentStage, lockId);
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

        // SD-VW-FIX-WORKER-GATE-REENTRY-001: Check for already-approved decisions
        // before re-processing gate/review stages. On re-entry after approval,
        // the worker would otherwise try to INSERT a duplicate decision row.
        if (REVIEW_MODE_STAGES.has(currentStage) || CHAIRMAN_GATES.BLOCKING.has(currentStage)) {
          const { data: approvedDecision } = await this._supabase
            .from('chairman_decisions')
            .select('id, status')
            .eq('venture_id', ventureId)
            .eq('lifecycle_stage', currentStage)
            .eq('status', 'approved')
            .limit(1)
            .maybeSingle();

          if (approvedDecision) {
            this._logger.log(`[Worker] Stage ${currentStage} already approved (decision ${approvedDecision.id}) — advancing`);
            // Update venture_stage_work so the UI reflects the approved gate as completed
            await this._supabase
              .from('venture_stage_work')
              .update({ stage_status: 'completed', completed_at: new Date().toISOString() })
              .eq('venture_id', ventureId)
              .eq('lifecycle_stage', currentStage);
            // CRITICAL: Update current_lifecycle_stage in DB so the next poll cycle
            // picks up from the correct stage. Without this, the venture stays at
            // the approved gate stage forever (infinite re-execution loop).
            const nextReentryStage = currentStage + 1;
            await this._supabase
              .from('ventures')
              .update({ current_lifecycle_stage: nextReentryStage })
              .eq('id', ventureId);
            this._logger.log(`[Worker] Advanced DB stage ${currentStage} → ${nextReentryStage} (re-entry after approval)`);
            this._logStageTransition(ventureId, currentStage, 'completed', stageDurationMs, result).catch(() => {});
            await this._runPostStageHooks(ventureId, currentStage);
            currentStage = nextReentryStage;
            continue;
          }
        }

        // Review-mode stages: pause for chairman review before auto-advancing
        if (REVIEW_MODE_STAGES.has(currentStage) && !CHAIRMAN_GATES.BLOCKING.has(currentStage)) {
          // Check global auto-approve — if enabled, skip the review pause entirely
          const reviewAutoApprove = await this._checkGlobalAutoApprove();
          if (reviewAutoApprove) {
            this._logger.log(`[Worker] Review-mode stage ${currentStage} auto-approved (global_auto_proceed=true)`);
            await this._supabase
              .from('venture_stage_work')
              .update({ stage_status: 'completed', completed_at: new Date().toISOString() })
              .eq('venture_id', ventureId)
              .eq('lifecycle_stage', currentStage);
            const nextReviewStage = currentStage + 1;
            await this._supabase
              .from('ventures')
              .update({ current_lifecycle_stage: nextReviewStage })
              .eq('id', ventureId);
            this._logger.log(`[Worker] Advanced DB stage ${currentStage} → ${nextReviewStage} (review auto-approved)`);
            this._logStageTransition(ventureId, currentStage, 'completed', stageDurationMs, result).catch(() => {});
            await this._runPostStageHooks(ventureId, currentStage);
            currentStage = nextReviewStage;
            continue;
          }

          this._logger.log(`[Worker] Review-mode stage ${currentStage} — blocking for chairman review`);

          // Revert current_lifecycle_stage back to the review stage so the UI
          // shows the correct stage (not N+1) while awaiting review.
          await this._supabase
            .from('ventures')
            .update({ current_lifecycle_stage: currentStage })
            .eq('id', ventureId);

          // Create or reuse a chairman_decisions row with decision_type = 'review'
          let reviewInsertOk = false;
          try {
            const { data: ventureForReview } = await this._supabase
              .from('ventures')
              .select('name')
              .eq('id', ventureId)
              .single();

            const { id: decisionId, isNew } = await createOrReusePendingDecision({
              ventureId,
              stageNumber: currentStage,
              briefData: { stage: currentStage, ventureName: ventureForReview?.name },
              summary: `Review: Stage ${currentStage} complete for ${ventureForReview?.name || ventureId}`,
              supabase: this._supabase,
              logger: this._logger,
            });
            reviewInsertOk = true;
            if (!isNew) {
              this._logger.log(`[Worker] Reused existing review decision ${decisionId} for stage ${currentStage}`);
            }
          } catch (err) {
            this._logger.error(`[Worker] Review decision creation failed: ${err.message}`);
          }

          // Only block the orchestrator if the decision row was successfully created.
          // If the insert failed, the venture would be permanently stuck with no
          // UI path to unblock. Instead, log the error and continue processing.
          if (reviewInsertOk) {
            this._logStageTransition(ventureId, currentStage, 'completed', stageDurationMs, result).catch(() => {});
            releaseState = ORCHESTRATOR_STATES.BLOCKED;
            lastResult = { ventureId, stageId: currentStage, status: 'blocked', gate: 'review' };
            break;
          } else {
            this._logger.warn(`[Worker] Skipping review block for stage ${currentStage} — decision insert failed, continuing to prevent stuck venture`);
          }
        }

        // Check chairman gate AFTER stage execution so validation data
        // is available for the user to review before approving/rejecting.
        // Also check hard_gate_stages from DB config (dynamic gates beyond the hardcoded set).
        const isHardcodedGate = CHAIRMAN_GATES.BLOCKING.has(currentStage);
        const isDynamicHardGate = !isHardcodedGate && await this._isInHardGateStages(currentStage);
        if (isHardcodedGate || isDynamicHardGate) {
          const gateResult = await this._handleChairmanGate(ventureId, currentStage);
          if (gateResult.blocked) {
            // Only revert current_lifecycle_stage when actually blocked for
            // chairman approval (L0).  processStage() may have already advanced
            // the stage via its internal filter engine — revert it so the
            // venture stays at the gate until the chairman approves.
            await this._supabase
              .from('ventures')
              .update({ current_lifecycle_stage: currentStage })
              .eq('id', ventureId);
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
          // Auto-approved — mark the stage work as approved so _syncStageWork
          // does NOT override stageStatus to 'blocked'. (Fix: QF-20260320-509 Bug 1)
          if (result) result._gateApproved = true;
          // Note: Stage 17 doc-generation runs in the approved-decision shortcut path
          // (line ~630), not here — hard-gated stages never reach this block on re-entry.
        }

        const resultStatus = (result?.status || '').toUpperCase();
        if (!result || resultStatus === 'FAILED') {
          this._logger.error(`[Worker] Stage ${currentStage} failed for ${ventureId} after retries`);
          this._logStageTransition(ventureId, currentStage, 'failed', stageDurationMs, result).catch(() => {});
          releaseState = ORCHESTRATOR_STATES.FAILED;
          break;
        }

        if (resultStatus === 'BLOCKED') {
          // Check governance config: if auto-proceed is enabled and this stage
          // is NOT a hard gate, override the BLOCKED status and advance.
          // This handles both: (1) stages in CHAIRMAN_GATES.BLOCKING that were
          // auto-approved via _handleChairmanGate (result._gateApproved=true),
          // and (2) stages NOT in BLOCKING that get BLOCKED by EVA's internal
          // gate evaluations (e.g., Stage 16 promotion gate).
          // Only override gate/decision blocks, NOT contract validation failures (missing upstream data)
          const isContractBlock = result?.errors?.some(e => e.code === 'MISSING_DEPENDENCY' || e.message?.includes('upstream') || e.message?.includes('missing'));
          const governanceOverride = !isContractBlock && (result._gateApproved || await this._shouldAutoApproveStage(currentStage));
          if (governanceOverride) {
            this._logger.log(`[Worker] Stage ${currentStage} BLOCKED by EVA but governance auto-approves — advancing as advisory`);
            this._recordAdvisoryWarning(ventureId, currentStage, result).catch(() => {});
            // Force advance since EVA didn't set nextStageId (it returned BLOCKED)
            const nextOverrideStage = currentStage + 1;
            await this._supabase.from('ventures')
              .update({ current_lifecycle_stage: nextOverrideStage })
              .eq('id', ventureId);
            await this._supabase.from('venture_stage_work')
              .update({ stage_status: 'completed', completed_at: new Date().toISOString() })
              .eq('venture_id', ventureId)
              .eq('stage_number', currentStage);
            this._logger.log(`[Worker] Governance override: advanced S${currentStage} → S${nextOverrideStage}`);
            this._logStageTransition(ventureId, currentStage, 'completed', stageDurationMs, result).catch(() => {});
            currentStage = nextOverrideStage;
            continue;
          } else {
            this._logger.log(`[Worker] Stage ${currentStage} blocked for ${ventureId}`);
            this._logStageTransition(ventureId, currentStage, 'blocked', stageDurationMs, result).catch(() => {});
            releaseState = ORCHESTRATOR_STATES.BLOCKED;
            break;
          }
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

        // Check for lifecycle completion or determine next stage
        if (currentStage >= MAX_STAGE) {
          this._logger.log(`[Worker] Venture ${ventureId} completed lifecycle at stage ${currentStage}`);
          await markCompleted(this._supabase, ventureId, { lockId, logger: this._logger });
          this._activeVentures.delete(ventureId);
          return lastResult;
        }

        if (result.nextStageId) {
          currentStage = result.nextStageId;
        } else {
          // nextStageId not set — the filter engine may have advanced the
          // venture in the DB already.  Re-read the current stage to pick up
          // any internal advancement (e.g., auto-proceed jumping stages).
          const { data: refreshed } = await this._supabase
            .from('ventures')
            .select('current_lifecycle_stage')
            .eq('id', ventureId)
            .single();
          const dbStage = refreshed?.current_lifecycle_stage;
          if (dbStage && dbStage > currentStage) {
            this._logger.log(`[Worker] DB stage advanced to ${dbStage} (was ${currentStage}) — continuing`);
            currentStage = dbStage;
          } else {
            // DB stage didn't advance — lifecycle truly complete or stalled
            this._logger.log(`[Worker] Venture ${ventureId} completed lifecycle at stage ${currentStage}`);
            await markCompleted(this._supabase, ventureId, { lockId, logger: this._logger });
            this._activeVentures.delete(ventureId);
            return lastResult;
          }
        }
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
   * Creates a stage_executions record before processing, updates heartbeat
   * during processing, and finalizes on completion or failure.
   *
   * SD-VW-BACKEND-EXEC-RECORDS-001
   *
   * Verify venture provisioning state and auto-provision if needed.
   * Best-effort: failures are logged but do not block the SD bridge.
   * SD: SD-LEO-INFRA-VENTURE-LEO-BUILD-001-G
   *
   * @param {string} ventureId - Venture UUID
   * @param {string} [ventureName] - Venture name for provisioning
   */
  async _verifyAndProvisionVenture(ventureId, ventureName) {
    try {
      // Check venture_provisioning_state
      const { data: provState, error: provError } = await this._supabase
        .from('venture_provisioning_state')
        .select('state, github_repo_url, provisioned_at')
        .eq('venture_name', ventureName)
        .maybeSingle();

      if (provError) {
        // Table may not exist yet — treat as not-provisioned
        this._logger.warn(`[Worker] Provisioning check query error (non-fatal): ${provError.message}`);
      }

      if (provState?.state === 'provisioned' && provState?.github_repo_url) {
        this._logger.log(`[Worker] Stage 18: Venture "${ventureName}" already provisioned (${provState.github_repo_url})`);
        return;
      }

      // Not provisioned — attempt auto-provision via venture-provisioner.js (Child C)
      // Falls back gracefully if provisioner module doesn't exist yet
      this._logger.log(`[Worker] Stage 18: Venture "${ventureName}" not provisioned — attempting auto-provision`);

      try {
        const provisionerPath = new URL('./venture-provisioner.js', import.meta.url);
        const { provisionVenture } = await import(provisionerPath.href);
        if (typeof provisionVenture === 'function') {
          const repoPath = provState?.github_repo_url || null;
          await provisionVenture(ventureName, { supabase: this._supabase, logger: this._logger, ventureRepoPath: repoPath });
          this._logger.log(`[Worker] Stage 18: Auto-provisioned venture "${ventureName}"`);
        } else {
          this._logger.warn('[Worker] Stage 18: provisionVenture not exported — skipping auto-provision');
        }
      } catch (importErr) {
        // Expected when venture-provisioner.js (Child C) is not yet implemented
        this._logger.warn(`[Worker] Stage 18: Auto-provision unavailable (${importErr.message}) — continuing without provisioning`);
      }
    } catch (err) {
      this._logger.warn(`[Worker] Stage 18: Provisioning verification failed (non-fatal): ${err.message}`);
    }
  }

  /**
   * @param {string} ventureId
   * @param {number} stageNumber
   * @param {string} [lockId] - Lock ID for periodic refresh (SD-VW-BACKEND-LOCK-HEARTBEAT-001)
   * @returns {Promise<Object>} Stage result
   */
  async _executeWithRetry(ventureId, stageNumber, lockId) {
    let lastError = null;

    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this._retryDelayMs * Math.pow(2, attempt - 1);
        this._logger.log(`[Worker] Retry ${attempt}/${this._maxRetries} for stage ${stageNumber} (delay ${delay}ms)`);
        await this._sleep(delay);
      }

      // Create execution record for this attempt
      const execId = await this._createStageExecution(ventureId, stageNumber);

      // Start heartbeat interval for execution record + lock refresh
      let heartbeatTimer = null;
      if (execId || lockId) {
        heartbeatTimer = setInterval(() => {
          if (execId) {
            this._updateExecutionHeartbeat(execId).catch(err =>
              this._logger.warn(`[Worker] Execution heartbeat failed: ${err.message}`)
            );
          }
          if (lockId) {
            this._refreshLock(ventureId, lockId).catch(err =>
              this._logger.warn(`[Worker] Lock refresh failed: ${err.message}`)
            );
          }
        }, this._execHeartbeatMs);
      }

      try {
        // Stable idempotency key: same ventureId+stage+lock produces same key
        // across retries within this invocation, preventing duplicate artifacts.
        const idempotencyKey = `${ventureId}-s${stageNumber}-${lockId || 'nolck'}`;

        const result = await processStage(
          {
            ventureId,
            stageId: stageNumber,
            options: {
              autoProceed: true,
              dryRun: this._dryRun,
              chairmanId: this._chairmanId,
              waitForReview: this._waitForReview,
              idempotencyKey,
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
          if (execId) {
            clearInterval(heartbeatTimer);
            await this._finalizeStageExecution(execId, 'succeeded', null);
          }
          return result;
        }

        // FAILED — finalize this attempt, retry if attempts remain
        lastError = result.errors?.[0]?.message || 'Unknown failure';
        if (execId) {
          clearInterval(heartbeatTimer);
          await this._finalizeStageExecution(execId, 'failed', lastError);
        }
        this._logger.warn(`[Worker] Stage ${stageNumber} attempt ${attempt + 1} failed: ${lastError}`);
      } catch (err) {
        lastError = err.message;
        if (execId) {
          clearInterval(heartbeatTimer);
          await this._finalizeStageExecution(execId, 'failed', lastError);
        }
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

  // ── Stage Execution Record Methods (SD-VW-BACKEND-EXEC-RECORDS-001) ──

  /**
   * Create a stage_executions record when starting stage processing.
   * Non-blocking: if insert fails, stage still processes (observability loss only).
   *
   * @param {string} ventureId
   * @param {number} stageNumber
   * @returns {Promise<string|null>} Execution record UUID, or null on failure
   */
  async _createStageExecution(ventureId, stageNumber) {
    try {
      const now = new Date().toISOString();
      const { data, error } = await this._supabase
        .from('stage_executions')
        .insert({
          venture_id: ventureId,
          lifecycle_stage: stageNumber,
          worker_id: this._workerId,
          status: 'running',
          started_at: now,
          heartbeat_at: now,
          metadata: { operating_mode: getOperatingMode(stageNumber) },
        })
        .select('id')
        .single();

      if (error) {
        this._logger.warn(`[Worker] stage_executions insert failed (non-fatal): ${error.message}`);
        return null;
      }

      return data.id;
    } catch (err) {
      this._logger.warn(`[Worker] stage_executions create error (non-fatal): ${err.message}`);
      return null;
    }
  }

  /**
   * Update heartbeat_at on a running execution record.
   *
   * @param {string} executionId
   */
  async _updateExecutionHeartbeat(executionId) {
    const { error } = await this._supabase
      .from('stage_executions')
      .update({ heartbeat_at: new Date().toISOString() })
      .eq('id', executionId)
      .eq('status', 'running');

    if (error) throw new Error(error.message);
  }

  /**
   * Finalize a stage execution record on completion or failure.
   *
   * @param {string} executionId
   * @param {'succeeded'|'failed'} status
   * @param {string|null} errorMessage
   */
  async _finalizeStageExecution(executionId, status, errorMessage) {
    try {
      const { error } = await this._supabase
        .from('stage_executions')
        .update({
          status,
          completed_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
          error_message: errorMessage,
        })
        .eq('id', executionId);

      if (error) {
        this._logger.warn(`[Worker] stage_executions finalize failed: ${error.message}`);
      }
    } catch (err) {
      this._logger.warn(`[Worker] stage_executions finalize error: ${err.message}`);
    }
  }

  /**
   * Mark running execution records with stale heartbeats as timed_out.
   * Supplements _releaseStaleLocks by detecting crashed workers at the
   * per-stage granularity rather than per-venture lock level.
   *
   * SD-VW-BACKEND-EXEC-RECORDS-001: FR5 — Stale execution detection
   */
  async _markStaleExecutions() {
    try {
      const cutoff = new Date(Date.now() - this._staleLockThresholdMs).toISOString();

      const { data: stale, error } = await this._supabase
        .from('stage_executions')
        .select('id, venture_id, lifecycle_stage, worker_id, heartbeat_at')
        .eq('status', 'running')
        .lt('heartbeat_at', cutoff);

      if (error) {
        this._logger.warn(`[Worker] Stale execution query failed: ${error.message}`);
        return;
      }

      if (!stale || stale.length === 0) return;

      for (const exec of stale) {
        const age = Date.now() - new Date(exec.heartbeat_at).getTime();
        this._logger.warn(
          `[Worker] Marking stale execution ${exec.id} as timed_out ` +
          `(venture=${exec.venture_id}, stage=${exec.lifecycle_stage}, ` +
          `worker=${exec.worker_id}, heartbeat ${Math.round(age / 1000)}s ago)`
        );

        const { error: updateError } = await this._supabase
          .from('stage_executions')
          .update({
            status: 'timed_out',
            completed_at: new Date().toISOString(),
            error_message: `Stale heartbeat detected (${Math.round(age / 1000)}s since last heartbeat)`,
          })
          .eq('id', exec.id)
          .eq('status', 'running');

        if (updateError) {
          this._logger.error(`[Worker] Failed to mark stale execution ${exec.id}: ${updateError.message}`);
        }
      }
    } catch (err) {
      this._logger.error(`[Worker] Stale execution sweep error: ${err.message}`);
    }
  }

  // ── Lock Heartbeat Refresh (SD-VW-BACKEND-LOCK-HEARTBEAT-001) ──

  /**
   * Refresh orchestrator_lock_acquired_at to prevent false stale-lock release.
   * Uses atomic conditional UPDATE with lock_id verification to prevent
   * refreshing a lock that was legitimately released/stolen.
   *
   * @param {string} ventureId
   * @param {string} lockId - Must match current orchestrator_lock_id
   * @returns {Promise<boolean>} True if refresh succeeded
   */
  async _refreshLock(ventureId, lockId) {
    const { data, error } = await this._supabase
      .from('ventures')
      .update({ orchestrator_lock_acquired_at: new Date().toISOString() })
      .eq('id', ventureId)
      .eq('orchestrator_lock_id', lockId)
      .eq('orchestrator_state', 'processing')
      .select('id');

    if (error) {
      throw new Error(`Lock refresh DB error: ${error.message}`);
    }

    if (!data || data.length === 0) {
      this._logger.warn(`[Worker] Lock refresh: no matching row (venture=${ventureId}, lockId=${lockId}) — lock may have been released`);
      return false;
    }

    return true;
  }

  // ── Chairman Gate & Lock Methods ──────────────────────────

  /**
   * Handle chairman gate: create or reuse pending decision, optionally wait.
   *
   * @param {string} ventureId
   * @param {number} stageNumber
   * @returns {Promise<{blocked: boolean, killed: boolean, approved: boolean}>}
   */
  async _handleChairmanGate(ventureId, stageNumber) {
    try {
      // Determine gate sub-type for autonomy check:
      //   kill_gate   (3, 5, 13, 23) → always manual, never auto-approve
      //   promotion_gate (10, 16, 17, 22, 24) → manual at L0-L1, auto at L2+
      const gateType = KILL_GATE_STAGES.has(stageNumber) ? 'kill_gate'
        : PROMOTION_GATE_STAGES.has(stageNumber) ? 'promotion_gate'
        : 'stage_gate'; // fallback for any future gates

      const autonomy = await checkAutonomy(ventureId, gateType, { supabase: this._supabase });
      if (autonomy.action === 'auto_approve') {
        this._logger.log(`[Worker] Chairman gate ${stageNumber} auto-approved (${autonomy.level}, type=${gateType})`);
        return { blocked: false, killed: false, approved: true };
      }

      // Check all 3 governance layers: global toggle, hard gates, per-stage overrides
      const shouldAutoApprove = await this._shouldAutoApproveStage(stageNumber);
      if (shouldAutoApprove) {
        this._logger.log(`[Worker] Chairman gate ${stageNumber} auto-approved (governance check passed, type=${gateType})`);
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

  // ── Post-Stage Hook Registry (SD-LEO-INFRA-CENTRALIZED-POST-STAGE-001) ──

  /**
   * Run any registered post-stage hooks for the completed stage.
   * Non-fatal: failures log warnings but never block advancement.
   * @param {string} ventureId
   * @param {number} completedStage - The stage that just finished
   */
  async _runPostStageHooks(ventureId, completedStage) {
    const hook = this._postStageHookRegistry.get(completedStage);
    if (!hook) return;
    try {
      await hook(ventureId);
      this._logger.log(`[Worker] Post-stage hook fired for S${completedStage} (venture ${ventureId})`);
    } catch (err) {
      this._logger.warn(`[Worker] Post-stage hook S${completedStage} failed (non-fatal): ${err.message}`);
    }
  }

  /**
   * S17 post-stage hook: Generate EVA vision + architecture plan documents.
   * @param {string} ventureId
   */
  async _postStageHook_S17_DocGen(ventureId) {
    const { data: ventureRow } = await this._supabase
      .from('ventures').select('name').eq('id', ventureId).single();
    const { generateDocs } = await import('./stage-templates/analysis-steps/stage-17-doc-generation.js');
    await generateDocs({
      ventureId,
      ventureName: ventureRow?.name,
      supabase: this._supabase,
      logger: this._logger,
    });
    this._logger.log('[Worker] S17 post-stage hook: vision + architecture docs generated');
  }

  /**
   * S19 post-stage hook: Convert sprint plan → LEO Strategic Directives via lifecycle-sd-bridge.
   * Queries S19 artifacts for sd_bridge_payloads, creates orchestrator + child SDs.
   * @param {string} ventureId
   */
  async _postStageHook_S19_Bridge(ventureId) {
    const { data: ventureRow } = await this._supabase
      .from('ventures').select('name').eq('id', ventureId).single();

    // Verify venture provisioning before SD bridge conversion
    await this._verifyAndProvisionVenture(ventureId, ventureRow?.name);

    // Fetch sd_bridge_payloads from S19 artifacts (fallback to S18 for legacy data)
    const { data: artifacts } = await this._supabase
      .from('venture_artifacts')
      .select('content, metadata')
      .eq('venture_id', ventureId)
      .in('lifecycle_stage', [19, 18])
      .eq('is_current', true)
      .order('lifecycle_stage', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);

    let sdBridgePayloads = [];
    for (const art of (artifacts || [])) {
      // SD-LEO-INFRA-CENTRALIZED-POST-STAGE-001: content column is TEXT — parse if needed
      let content = art.content;
      if (typeof content === 'string') {
        try { content = JSON.parse(content); } catch { content = {}; }
      }
      let meta = art.metadata;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch { meta = {}; }
      }

      const payloads = content?.sd_bridge_payloads
        || meta?.sd_bridge_payloads
        || content?.stage18_data?.sd_bridge_payloads
        || content?.stage19_data?.sd_bridge_payloads;
      if (payloads?.length > 0) {
        sdBridgePayloads = payloads;
        break;
      }
    }

    if (sdBridgePayloads.length === 0) {
      this._logger.log('[Worker] S19 post-stage hook: No sd_bridge_payloads found in artifacts');
      return;
    }

    // Query EVA records for vision_key and plan_key
    const { data: visionDoc } = await this._supabase
      .from('eva_vision_documents')
      .select('vision_key')
      .eq('venture_id', ventureId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: archPlan } = await this._supabase
      .from('eva_architecture_plans')
      .select('plan_key')
      .eq('venture_id', ventureId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { convertSprintToSDs, buildBridgeArtifactRecord } = await import('./lifecycle-sd-bridge.js');
    const { writeArtifact } = await import('./artifact-persistence-service.js');

    const firstArt = artifacts[0] || {};
    let firstContent = firstArt.content;
    if (typeof firstContent === 'string') {
      try { firstContent = JSON.parse(firstContent); } catch { firstContent = {}; }
    }
    let firstMeta = firstArt.metadata;
    if (typeof firstMeta === 'string') {
      try { firstMeta = JSON.parse(firstMeta); } catch { firstMeta = {}; }
    }

    const stageOutput = {
      sd_bridge_payloads: sdBridgePayloads,
      sprint_name: firstContent?.sprint_name || firstMeta?.sprint_name || 'unknown',
      sprint_goal: firstContent?.sprint_goal || firstMeta?.sprint_goal || '',
      sprint_duration_days: firstContent?.sprint_duration_days || firstMeta?.sprint_duration_days || 14,
    };

    const ventureContext = { id: ventureId, name: ventureRow?.name };
    const evaKeys = {
      vision_key: visionDoc?.vision_key || null,
      plan_key: archPlan?.plan_key || null,
    };

    const bridgeResult = await convertSprintToSDs(
      { stageOutput, ventureContext, evaKeys },
      { supabase: this._supabase, logger: this._logger },
    );

    if (bridgeResult.created) {
      this._logger.log(`[Worker] S19 post-stage hook: Created orchestrator ${bridgeResult.orchestratorKey} with ${bridgeResult.childKeys.length} children`);

      // Persist bridge result as artifact
      try {
        const bridgeArtifact = buildBridgeArtifactRecord(ventureId, 19, bridgeResult);
        await writeArtifact(this._supabase, {
          ventureId,
          lifecycleStage: bridgeArtifact.lifecycle_stage,
          artifactType: bridgeArtifact.artifact_type,
          title: bridgeArtifact.title,
          content: bridgeArtifact.content,
          metadata: bridgeArtifact.metadata,
          source: bridgeArtifact.source || 'lifecycle-sd-bridge',
          qualityScore: bridgeArtifact.quality_score ?? 100,
          validationStatus: bridgeArtifact.validation_status || 'validated',
          validatedBy: bridgeArtifact.validated_by,
        });
      } catch (bridgeArtErr) {
        this._logger.warn(`[Worker] Bridge artifact persist failed: ${bridgeArtErr.message}`);
      }
    } else {
      const errors = bridgeResult.errors || bridgeResult.error || 'unknown';
      this._logger.error(`[Worker] S19 post-stage hook: Bridge FAILED to create SDs for venture ${ventureId}. Errors: ${JSON.stringify(errors)}`);
    }
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
  /**
   * SD-LEO-FEAT-PER-STAGE-AUTO-PROCEED-001: Check Chairman governance override for a stage.
   * Returns the override config if the stage is set to manual, or null if auto.
   * @param {number} stageNumber
   * @returns {Promise<{auto_proceed: boolean, reason: string}|null>}
   */
  async _checkGovernanceOverride(stageNumber) {
    try {
      const { data } = await this._supabase
        .from('chairman_dashboard_config')
        .select('stage_overrides')
        .eq('config_key', 'default')
        .maybeSingle();

      if (!data?.stage_overrides) return null;

      const key = `stage_${stageNumber}`;
      const override = data.stage_overrides[key];
      if (!override) return null;

      return override;
    } catch {
      // If governance table doesn't exist or query fails, default to allowing auto-proceed
      return null;
    }
  }

  /**
   * SD-LEO-INFRA-S20-BUILD-PENDING-001-A: Check if Stage 20 should block
   * waiting for linked LEO Strategic Directives to complete.
   *
   * Returns { blocked, totalCount, nonTerminalCount, healthScore } where:
   * - blocked=true when non-terminal SDs exist (and no Force Advance)
   * - totalCount = total SDs linked to this venture
   * - nonTerminalCount = SDs not in (completed, cancelled)
   * - healthScore = green/yellow/red based on time since stage started
   *
   * @param {string} ventureId
   * @returns {Promise<Object>}
   */
  async _checkBuildPending(ventureId) {
    const result = { blocked: false, totalCount: 0, nonTerminalCount: 0, healthScore: 'green' };

    try {
      // Check for Force Advance override in venture_stage_work
      const { data: stageWork } = await this._supabase
        .from('venture_stage_work')
        .select('advisory_data, started_at')
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', 20)
        .maybeSingle();

      if (stageWork?.advisory_data?.override === true) {
        this._logger.log('[Worker] Stage 20 BUILD_PENDING: Force Advance detected — skipping SD check');
        return result; // not blocked
      }

      // Query all SDs linked to this venture
      const { data: allSDs } = await this._supabase
        .from('strategic_directives_v2')
        .select('sd_key, status')
        .eq('venture_id', ventureId);

      if (!allSDs || allSDs.length === 0) {
        // No SDs linked — pre-bridge venture, proceed normally
        return result;
      }

      result.totalCount = allSDs.length;
      const terminalStatuses = new Set(['completed', 'cancelled']);
      const nonTerminal = allSDs.filter(sd => !terminalStatuses.has(sd.status));
      result.nonTerminalCount = nonTerminal.length;

      if (nonTerminal.length > 0) {
        result.blocked = true;

        // Update stage_status to blocked in venture_stage_work
        await this._supabase
          .from('venture_stage_work')
          .upsert({
            venture_id: ventureId,
            lifecycle_stage: 20,
            stage_status: 'blocked',
            work_type: 'sd_required',
            advisory_data: {
              build_pending: true,
              total_sds: result.totalCount,
              non_terminal_sds: result.nonTerminalCount,
              sd_statuses: allSDs.map(sd => ({ sd_key: sd.sd_key, status: sd.status })),
              checked_at: new Date().toISOString(),
            },
          }, { onConflict: 'venture_id,lifecycle_stage' });

        // Compute staleness health_score
        if (stageWork?.started_at) {
          const daysSinceStart = (Date.now() - new Date(stageWork.started_at).getTime()) / (1000 * 60 * 60 * 24);

          // Read configurable thresholds from chairman_dashboard_config
          let daysToYellow = 3;
          let daysToRed = 7;
          try {
            const { data: config } = await this._supabase
              .from('chairman_dashboard_config')
              .select('stage_overrides')
              .eq('config_key', 'default')
              .maybeSingle();

            const s20Override = config?.stage_overrides?.stage_20;
            if (s20Override?.days_to_yellow) daysToYellow = s20Override.days_to_yellow;
            if (s20Override?.days_to_red) daysToRed = s20Override.days_to_red;
          } catch { /* use defaults */ }

          if (daysSinceStart >= daysToRed) {
            result.healthScore = 'red';
          } else if (daysSinceStart >= daysToYellow) {
            result.healthScore = 'yellow';
          }

          // Update health_score on venture_stage_work
          if (result.healthScore !== 'green') {
            await this._supabase
              .from('venture_stage_work')
              .update({ health_score: result.healthScore })
              .eq('venture_id', ventureId)
              .eq('lifecycle_stage', 20);
          }
        }
      }

      return result;
    } catch (err) {
      this._logger.warn(`[Worker] BUILD_PENDING check failed (non-fatal): ${err.message}`);
      return result; // fail-open: don't block on check failure
    }
  }

  /**
   * Check if global auto-approve is enabled in chairman dashboard config.
   * When enabled, all chairman gates are auto-approved without blocking.
   * @returns {Promise<boolean>}
   */
  async _checkGlobalAutoApprove() {
    try {
      const { data, error } = await this._supabase
        .from('chairman_dashboard_config')
        .select('global_auto_proceed')
        .eq('config_key', 'default')
        .maybeSingle();

      if (error) {
        this._logger.warn(`[Worker] _checkGlobalAutoApprove query error: ${error.message}`);
        return false;
      }
      const result = data?.global_auto_proceed === true;
      this._logger.log(`[Worker] _checkGlobalAutoApprove: data=${JSON.stringify(data)}, result=${result}`);
      return result;
    } catch (err) {
      this._logger.warn(`[Worker] _checkGlobalAutoApprove threw: ${err.message}`);
      return false;
    }
  }

  /**
   * Unified 3-layer governance check for auto-approval.
   * Layer 1: global_auto_proceed (master toggle — if false, never auto-approve)
   * Layer 2: hard_gate_stages (stages that NEVER auto-approve regardless of global)
   * Layer 3: stage_overrides (per-stage pause/resume with reason)
   * @param {number} stageNumber
   * @returns {Promise<boolean>}
   */
  async _shouldAutoApproveStage(stageNumber) {
    try {
      const { data, error } = await this._supabase
        .from('chairman_dashboard_config')
        .select('global_auto_proceed, hard_gate_stages, stage_overrides')
        .eq('config_key', 'default')
        .maybeSingle();

      if (error || !data) {
        this._logger.warn('[Worker] _shouldAutoApproveStage: config query failed, defaulting to block');
        return false;
      }

      // Layer 1: Global toggle must be on
      if (!data.global_auto_proceed) {
        this._logger.log(`[Worker] _shouldAutoApproveStage(${stageNumber}): blocked — global_auto_proceed=false`);
        return false;
      }

      // Layer 2: Hard gate stages NEVER auto-approve
      const hardGates = data.hard_gate_stages || [];
      if (hardGates.includes(stageNumber)) {
        this._logger.log(`[Worker] _shouldAutoApproveStage(${stageNumber}): blocked — in hard_gate_stages ${JSON.stringify(hardGates)}`);
        return false;
      }

      // Layer 3: Per-stage override
      const override = data.stage_overrides?.[`stage_${stageNumber}`];
      if (override && override.auto_proceed === false) {
        this._logger.log(`[Worker] _shouldAutoApproveStage(${stageNumber}): blocked — stage_override (reason: ${override.reason || 'none'})`);
        return false;
      }

      this._logger.log(`[Worker] _shouldAutoApproveStage(${stageNumber}): approved — all governance layers passed`);
      return true;
    } catch (err) {
      this._logger.warn(`[Worker] _shouldAutoApproveStage threw: ${err.message}`);
      return false;
    }
  }

  /**
   * Record an advisory warning when a gate was auto-overridden by governance config.
   * Writes to venture_stage_work.advisory_data.gate_overrides array.
   */
  async _recordAdvisoryWarning(ventureId, stageNumber, result) {
    try {
      const { data: existing } = await this._supabase
        .from('venture_stage_work')
        .select('advisory_data')
        .eq('venture_id', ventureId)
        .eq('stage_number', stageNumber)
        .maybeSingle();

      const advisory = existing?.advisory_data || {};
      const overrides = advisory.gate_overrides || [];
      overrides.push({
        stage: stageNumber,
        original_status: result?.status || 'BLOCKED',
        override_reason: 'governance_auto_proceed',
        gate_type: result?.gate || 'unknown',
        timestamp: new Date().toISOString(),
      });
      advisory.gate_overrides = overrides;

      await this._supabase
        .from('venture_stage_work')
        .upsert({
          venture_id: ventureId,
          stage_number: stageNumber,
          advisory_data: advisory,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'venture_id,stage_number' });

      this._logger.log(`[Worker] Advisory warning recorded for stage ${stageNumber} gate override`);
    } catch (err) {
      this._logger.warn(`[Worker] Failed to record advisory warning: ${err.message}`);
    }
  }

  /**
   * Check if a stage is in the dynamic hard_gate_stages config.
   * Used alongside the static CHAIRMAN_GATES.BLOCKING set.
   */
  async _isInHardGateStages(stageNumber) {
    try {
      const { data } = await this._supabase
        .from('chairman_dashboard_config')
        .select('hard_gate_stages')
        .eq('config_key', 'default')
        .maybeSingle();
      return (data?.hard_gate_stages || []).includes(stageNumber);
    } catch {
      return false;
    }
  }

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
    else if (resultStatus === 'FAILED') stageStatus = 'blocked'; // DB constraint only allows: not_started, in_progress, blocked, completed, skipped
    else stageStatus = 'in_progress';

    // For chairman gate stages, mark as blocked (awaiting chairman approval)
    // Skip override when gate was already auto-approved (Bug 1 fix: QF-20260320-509)
    const isGateStage = CHAIRMAN_GATES.BLOCKING.has(stageNumber) || await this._isInHardGateStages(stageNumber);
    if (isGateStage && stageStatus === 'completed' && !result._gateApproved) {
      stageStatus = 'blocked';
    }

    // Fetch work_type from lifecycle_stage_config (required NOT NULL column)
    let workType = 'artifact_only'; // fallback
    try {
      const { data: cfg } = await this._supabase
        .from('lifecycle_stage_config')
        .select('work_type')
        .eq('stage_number', stageNumber)
        .single();
      if (cfg?.work_type) workType = cfg.work_type;
    } catch { /* use fallback */ }

    const now = new Date().toISOString();
    const updateData = {
      stage_status: stageStatus,
      work_type: workType,
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
      .upsert({
        venture_id: ventureId,
        lifecycle_stage: stageNumber,
        ...updateData,
      }, { onConflict: 'venture_id,lifecycle_stage' });

    if (error) {
      this._logger.warn(`[Worker] venture_stage_work upsert failed for stage ${stageNumber}: ${error.message}`);
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

export { CHAIRMAN_GATES, KILL_GATE_STAGES, PROMOTION_GATE_STAGES, REVIEW_MODE_STAGES, OPERATING_MODES, getOperatingMode };

export default StageExecutionWorker;
