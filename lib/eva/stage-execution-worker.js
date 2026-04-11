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
import { S20PauseController } from './s20-pause-controller.js';

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
const MAX_SPRINT_ITERATIONS = 5; // SD-LEO-ORCH-VENTURE-FACTORY-OUTPUT-QUALITY-001-D: safety limit for sprint iteration loop
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

    /** @type {S20PauseController} SD-LEO-INFRA-S20-VENTURE-LEO-001 */
    this._s20PauseController = new S20PauseController(this._supabase, this._logger);

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
      [15, (ventureId) => this._postStageHook_S15_StitchProvision(ventureId)],
      [17, (ventureId) => this._postStageHook_S17_DocGen(ventureId)],
      [19, (ventureId) => this._postStageHook_S19_Bridge(ventureId)],
    ]);
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Start the polling loop.
   * Idempotent: calling start() when already running is a no-op.
   */
  async start() {
    if (this._running) {
      this._logger.warn('[Worker] Already running');
      return;
    }

    this._running = true;
    this._startedAt = new Date();
    this._logger.log(`[Worker] Started (poll every ${this._pollIntervalMs}ms, dryRun=${this._dryRun}, id=${this._workerId})`);

    // SD-FIX-WORKER-STARTUP-LOCK-RECOVERY-001: Reset orphaned locks from previous worker instances
    await this._onStartupRecovery();

    // Register heartbeat
    this._upsertHeartbeat('online').catch(err =>
      this._logger.warn(`[Worker] Initial heartbeat failed: ${err.message}`)
    );

    // SD-LEO-INFRA-S20-VENTURE-LEO-001: Restore realtime subscriptions for paused ventures
    this._s20PauseController.restoreSubscriptions().catch(err =>
      this._logger.warn(`[Worker] S20 subscription restore failed: ${err.message}`)
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

    // SD-LEO-INFRA-S20-VENTURE-LEO-001: Cleanup S20 pause controller
    this._s20PauseController.destroy();

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
      await this._checkResolvedBlocks();
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

        // SD-LEO-INFRA-S20-VENTURE-LEO-001: S20 Pause/Resume Controller
        // Event-driven pause at S20 waiting for orchestrator SD completion.
        // Replaces the legacy BUILD_PENDING error gate with a proper state machine
        // that persists across worker restarts and uses realtime subscriptions.
        if (currentStage === 20) {
          const pauseResult = await this._s20PauseController.check(ventureId);

          // Replit path — delegate to legacy handler
          if (pauseResult.status === 'replit_path') {
            const replitResult = await this._checkReplitBuildPending(ventureId);
            if (replitResult.blocked) {
              releaseState = ORCHESTRATOR_STATES.BLOCKED;
              lastResult = { ventureId, stageId: currentStage, status: 'replit_build_pending', ...replitResult };
              break;
            }
          } else if (pauseResult.blocked) {
            releaseState = ORCHESTRATOR_STATES.BLOCKED;
            lastResult = {
              ventureId,
              stageId: currentStage,
              status: 'build_pending',
              ...pauseResult.data,
            };
            break;
          } else if (pauseResult.status === 'complete' || pauseResult.status === 'force_advanced') {
            this._logger.log(
              `[Worker] Stage 20 S20Pause: ${pauseResult.status} — proceeding with real build data`
            );
          }
          // status === 'no_sds' or 'error' — proceed (backward compatible / fail-open)
        }

        // SD-LEO-ORCH-VENTURE-FACTORY-OUTPUT-QUALITY-001-D: Build readiness gate
        // Block Stage 19 entry when Stage 18 buildReadiness.decision is no_go
        if (currentStage === 19) {
          try {
            const { data: s18Artifact } = await this._supabase
              .from('venture_artifacts')
              .select('artifact_data')
              .eq('venture_id', ventureId)
              .eq('lifecycle_stage', 18)
              .eq('is_current', true)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
            const s18Data = s18Artifact?.artifact_data?.stage18_data || s18Artifact?.artifact_data;
            const decision = s18Data?.buildReadiness?.decision;
            if (decision === 'no_go') {
              this._logger.warn(`[Worker] Stage 19 BLOCKED: Stage 18 buildReadiness.decision is no_go for venture ${ventureId}`);
              releaseState = ORCHESTRATOR_STATES.BLOCKED;
              lastResult = { ventureId, stageId: 19, status: 'blocked', gate: 'build_readiness_no_go' };
              break;
            }
          } catch (_e) {
            // No Stage 18 artifact — proceed (backward compatible)
          }
        }

        // P0 UNIVERSAL pre-execution guard: check for approved decisions at ANY stage
        // before calling processStage. This prevents re-execution when chairman approves
        // stages blocked by taste gates, promotion gates, or other non-BLOCKING paths.
        // SD-LEO-FIX-EVA-STAGE-WORKER-001: Moved outside isPreExecGate conditional.
        {
          const { data: universalApproved } = await this._supabase
            .from('chairman_decisions')
            .select('id, status, updated_at')
            .eq('venture_id', ventureId)
            .eq('lifecycle_stage', currentStage)
            .eq('status', 'approved')
            .neq('decision_type', 'advisory')
            .limit(1)
            .maybeSingle();

          if (universalApproved) {
            const { data: existingArt } = await this._supabase
              .from('venture_artifacts')
              .select('id')
              .eq('venture_id', ventureId)
              .eq('lifecycle_stage', currentStage)
              .eq('is_current', true)
              .limit(1);

            if (existingArt && existingArt.length > 0) {
              // Stage already approved + has artifacts — skip re-execution
              const isBlockingGate = CHAIRMAN_GATES.BLOCKING.has(currentStage);
              if (!isBlockingGate) {
                // Non-BLOCKING stages: just advance (no vision side-effects needed)
                this._logger.log(
                  `[Worker] Stage ${currentStage} already approved (decision ${universalApproved.id}) + has artifacts — skipping re-execution, advancing`
                );
                const nextStage = currentStage + 1;
                await this._advanceStage(ventureId, currentStage, nextStage, { advancementType: 'pre_exec_skip' });
                currentStage = nextStage;
                continue;
              }
              // BLOCKING stages fall through to the isPreExecGate block below
              // which handles vision side-effects (S3/S5 un-archive etc.)
            }
          }
        }

        // Gate-specific pre-execution guard: handles pending decisions, vision side-effects
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
            const shouldAutoApprove = await this._canAutoAdvance(currentStage);
            if (shouldAutoApprove) {
              this._logger.log(
                `[Worker] Stage ${currentStage} pending decision ${pendingDecision.id} — auto-approving (global_auto_proceed=true)`
              );
              await this._supabase
                .from('chairman_decisions')
                .update({ status: 'approved', decision: 'proceed', blocking: false, updated_at: new Date().toISOString() })
                .eq('id', pendingDecision.id);

              // Enrich existing artifact with promotion_gate if missing (build-loop stages).
              // The pending-decision shortcut skips processStage(), so promotion_gate
              // may not have been computed. evaluatePromotionGate is pure/algorithmic.
              // RCA: PAT-ORCH-STATE-001 (pending-decision shortcut artifact gap)
              if (currentStage >= 18 && currentStage <= 23) {
                try {
                  const { fetchUpstreamArtifacts, persistArtifact } = await import('./stage-execution-engine.js');
                  const { data: existingArt } = await this._supabase.from('venture_artifacts')
                    .select('id, artifact_data')
                    .eq('venture_id', ventureId).eq('lifecycle_stage', currentStage).eq('is_current', true)
                    .maybeSingle();
                  if (existingArt && !existingArt.artifact_data?.promotion_gate) {
                    const { evaluatePromotionGate } = await import('./stage-templates/stage-23.js');
                    // evaluatePromotionGate uses legacy param names (stage17=build readiness, etc.)
                    // Map lifecycle stage numbers → legacy names: lifecycle 18→stage17, 19→stage18, etc.
                    const upstream = await fetchUpstreamArtifacts(this._supabase, ventureId,
                      [18, 19, 20, 21, 22].filter(s => s < currentStage));
                    const gate = evaluatePromotionGate({
                      stage17: upstream.stage18Data, stage18: upstream.stage19Data,
                      stage19: upstream.stage20Data, stage20: upstream.stage21Data,
                      stage21: upstream.stage22Data, stage22: existingArt.artifact_data,
                    });
                    const enriched = { ...existingArt.artifact_data, promotion_gate: gate };
                    await this._supabase.from('venture_artifacts')
                      .update({ artifact_data: enriched, content: enriched })
                      .eq('id', existingArt.id);
                    this._logger.log(`[Worker] Pending auto-approve: enriched S${currentStage} artifact with promotion_gate (pass=${gate.pass})`);
                  }
                } catch (pgErr) {
                  this._logger.warn(`[Worker] promotion_gate enrichment failed (non-fatal): ${pgErr.message}`);
                }
              }

              const nextStage = currentStage + 1;
              await this._advanceStage(ventureId, currentStage, nextStage, { advancementType: 'auto_approved' });
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
            .select('id, status, updated_at')
            .eq('venture_id', ventureId)
            .eq('lifecycle_stage', currentStage)
            .eq('status', 'approved')
            .neq('decision_type', 'advisory')
            .limit(1)
            .maybeSingle();

          if (approvedDecision && approvedDecision.status === 'approved') {
            // SD-CHAIRMAN-APPROVAL-SIDEEFFECTS-ATOMICITY-ORCH-001-B:
            // Check chairman_decision_audit table to see if DB trigger already applied
            // side-effects (vision un-archive). If so, skip processStage entirely.
            if (currentStage === 3 || currentStage === 5) {
              const { data: auditRow } = await this._supabase
                .from('chairman_decision_audit')
                .select('id, applied_at')
                .eq('venture_id', ventureId)
                .eq('lifecycle_stage', currentStage)
                .eq('effect_type', 'vision_unarchive')
                .limit(1)
                .maybeSingle();

              if (auditRow) {
                this._logger.log(
                  `[Worker] Kill gate side-effects already applied by DB trigger (audit ${auditRow.id}, applied ${auditRow.applied_at}) — skipping processStage`
                );
                const nextStage = currentStage + 1;
                await this._advanceStage(ventureId, currentStage, nextStage, { advancementType: 'pre_exec_skip_trigger' });
                currentStage = nextStage;
                continue;
              }
            }

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

              // SD-MAN-FIX-FIX-ARCHIVED-VISION-001: Un-archive vision on kill gate override
              // Demoted to TTL-based fallback (SD-CHAIRMAN-APPROVAL-SIDEEFFECTS-ATOMICITY-ORCH-001-B).
              // Primary path is now the DB trigger (trg_chairman_approval_side_effects).
              // This code fires only if the trigger failed to create an audit row within 60s.
              if (currentStage === 3 || currentStage === 5) {
                const approvalAge = approvedDecision.updated_at
                  ? (Date.now() - new Date(approvedDecision.updated_at).getTime()) / 1000
                  : Infinity;
                if (approvalAge > 60) {
                  this._logger.warn(
                    `[Worker] WARNING: DB trigger did not fire for decision ${approvedDecision.id} (approval age: ${Math.round(approvalAge)}s). Executing fallback un-archive.`
                  );
                  const { data: archivedVision } = await this._supabase
                    .from('eva_vision_documents')
                    .select('vision_key, status')
                    .eq('venture_id', ventureId)
                    .eq('status', 'archived')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                  if (archivedVision) {
                    // SD-VISION-QUALITY-GATE-BYPASS-ORCH-001-B: Use RPC with session variable bypass
                    // instead of direct UPDATE, which is blocked by trg_enforce_vision_quality_advancement
                    // when quality_checked=false (common for EVA-seeded stub visions).
                    const { data: rpcResult, error: rpcError } = await this._supabase
                      .rpc('rpc_activate_vision_with_bypass', {
                        p_venture_id: ventureId,
                        p_vision_key: archivedVision.vision_key
                      });
                    if (rpcError || (rpcResult && rpcResult.success === false)) {
                      this._logger.warn(
                        `[Worker] WARNING: Vision bypass RPC failed for ${archivedVision.vision_key}: ${rpcError?.message || rpcResult?.error || 'unknown error'}`
                      );
                    } else {
                      this._logger.log(`[Worker] Vision ${archivedVision.vision_key} restored to active via RPC bypass (fallback at stage ${currentStage})`);
                    }
                  }
                }
              }

              const nextStage = currentStage + 1;
              await this._advanceStage(ventureId, currentStage, nextStage, { advancementType: 'pre_exec_skip' });
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
            .select('id, status, updated_at')
            .eq('venture_id', ventureId)
            .eq('lifecycle_stage', currentStage)
            .eq('status', 'approved')
            .neq('decision_type', 'advisory')
            .limit(1)
            .maybeSingle();

          if (approvedDecision) {
            this._logger.log(`[Worker] Stage ${currentStage} already approved (decision ${approvedDecision.id}) — advancing`);
            const nextReentryStage = currentStage + 1;
            await this._advanceStage(ventureId, currentStage, nextReentryStage, { durationMs: stageDurationMs, result, advancementType: 're_entry' });
            currentStage = nextReentryStage;
            continue;
          }
        }

        // Review-mode stages: ALWAYS pause for chairman review before auto-advancing.
        // SD-LEO-FIX-EVA-STAGE-WORKER-001: review_mode stages are NOT bypassable by
        // global_auto_proceed. These stages exist specifically for human quality control
        // (S7 Revenue Arch, S8 BMC, S9 Exit Strategy, S11 Naming/Visual).
        if (REVIEW_MODE_STAGES.has(currentStage) && !CHAIRMAN_GATES.BLOCKING.has(currentStage)) {

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
              decisionType: 'review',
              supabase: this._supabase,
              logger: this._logger,
            });
            reviewInsertOk = true;
            if (!isNew) {
              // SD-LEO-INFRA-UNIFIED-GATE-ENFORCEMENT-001: Check if decision is already approved
              const { data: existingDecision } = await this._supabase
                .from('chairman_decisions')
                .select('status')
                .eq('id', decisionId)
                .single();
              if (existingDecision?.status === 'approved') {
                this._logger.log(`[Worker] Review decision ${decisionId} already approved — auto-advancing stage ${currentStage}`);
                result._gateApproved = true;
                reviewInsertOk = false; // Skip blocking below
              } else {
                this._logger.log(`[Worker] Reused existing review decision ${decisionId} for stage ${currentStage}`);
              }
            }
          } catch (err) {
            this._logger.error(`[Worker] Review decision creation failed: ${err.message}`);
          }

          // Only block the orchestrator if the decision row was successfully created
          // AND the decision is not already approved.
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
          // For build-loop stages with auto-approve, treat FAILED as BLOCKED so
          // governance can override. Analysis steps throw REFUSED for LLM-disabled
          // stages, which becomes FAILED — but governance should still advance.
          // RCA: PAT-ORCH-STATE-001 (FAILED vs BLOCKED in build-loop)
          const canGovernanceOverrideFailed = resultStatus === 'FAILED'
            && currentStage >= 17 && currentStage <= 22
            && await this._canAutoAdvance(currentStage);
          if (!canGovernanceOverrideFailed) {
            this._logger.error(`[Worker] Stage ${currentStage} failed for ${ventureId} after retries`);
            this._logStageTransition(ventureId, currentStage, 'failed', stageDurationMs, result).catch(() => {});
            releaseState = ORCHESTRATOR_STATES.FAILED;
            break;
          }
          this._logger.log(`[Worker] Stage ${currentStage} FAILED but governance can override (build-loop auto-approve)`);
          // Fall through to BLOCKED handler which has governance override logic
        }

        if (resultStatus === 'BLOCKED' || resultStatus === 'FAILED') {
          // Check governance config: if auto-proceed is enabled and this stage
          // is NOT a hard gate, override the BLOCKED status and advance.
          // This handles both: (1) stages in CHAIRMAN_GATES.BLOCKING that were
          // auto-approved via _handleChairmanGate (result._gateApproved=true),
          // and (2) stages NOT in BLOCKING that get BLOCKED by EVA's internal
          // gate evaluations (e.g., Stage 16 promotion gate).
          // Only override gate/decision blocks, NOT contract validation failures (missing upstream data)
          const isContractBlock = result?.errors?.some(e => e.code === 'MISSING_DEPENDENCY' || e.message?.includes('upstream') || e.message?.includes('missing'));
          const governanceOverride = !isContractBlock && (result._gateApproved || await this._canAutoAdvance(currentStage));
          if (governanceOverride) {
            this._logger.log(`[Worker] Stage ${currentStage} BLOCKED by EVA but governance auto-approves — advancing as advisory`);
            this._recordAdvisoryWarning(ventureId, currentStage, result).catch(() => {});

            // Enrich existing artifact with promotion_gate if missing (build-loop stages).
            // When governance overrides a BLOCKED/FAILED stage, the analysis step's
            // real-data path may not have executed, leaving promotion_gate absent.
            // Update in-place (not via persistArtifact which creates a new row).
            // RCA: PAT-ORCH-STATE-001 (governance override artifact gap)
            if (currentStage >= 18 && currentStage <= 23) {
              try {
                const { fetchUpstreamArtifacts } = await import('./stage-execution-engine.js');
                const { data: existingArt } = await this._supabase.from('venture_artifacts')
                  .select('id, artifact_data')
                  .eq('venture_id', ventureId).eq('lifecycle_stage', currentStage).eq('is_current', true)
                  .maybeSingle();
                if (existingArt && !existingArt.artifact_data?.promotion_gate) {
                  const { evaluatePromotionGate } = await import('./stage-templates/stage-23.js');
                  // evaluatePromotionGate uses legacy param names (stage17=build readiness, etc.)
                  // Map lifecycle stage numbers → legacy names: lifecycle 18→stage17, 19→stage18, etc.
                  const upstream = await fetchUpstreamArtifacts(this._supabase, ventureId,
                    [18, 19, 20, 21, 22].filter(s => s < currentStage));
                  const gate = evaluatePromotionGate({
                    stage17: upstream.stage18Data, stage18: upstream.stage19Data,
                    stage19: upstream.stage20Data, stage20: upstream.stage21Data,
                    stage21: upstream.stage22Data, stage22: existingArt.artifact_data,
                  });
                  const enriched = { ...existingArt.artifact_data, promotion_gate: gate };
                  await this._supabase.from('venture_artifacts')
                    .update({ artifact_data: enriched, content: enriched })
                    .eq('id', existingArt.id);
                  this._logger.log(`[Worker] Governance override: enriched S${currentStage} with promotion_gate (pass=${gate.pass})`);
                }
              } catch (pgErr) {
                this._logger.warn(`[Worker] promotion_gate enrichment failed (non-fatal): ${pgErr.message}`);
              }
            }

            // Force advance since EVA didn't set nextStageId (it returned BLOCKED)
            const nextOverrideStage = currentStage + 1;
            await this._advanceStage(ventureId, currentStage, nextOverrideStage, { durationMs: stageDurationMs, result, advancementType: 'governance_override' });
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

        // SD-LEO-ORCH-VENTURE-FACTORY-OUTPUT-QUALITY-001-D: Sprint iteration loop
        // After Stage 19 completes, check if the sprint plan indicates remaining work
        // that needs additional sprints. If so, loop back to Stage 19.
        if (currentStage === 19) {
          const sprintData = result?.data || result;
          const hasValueFeature = sprintData?.hasValueFeature ?? true;
          const items = sprintData?.items || [];
          const totalItems = sprintData?.total_items || items.length;

          // Read current sprint iteration from venture metadata
          const { data: ventureRecord } = await this._supabase
            .from('ventures')
            .select('metadata')
            .eq('id', ventureId)
            .single();
          const currentIteration = ventureRecord?.metadata?.sprint_iteration || 0;

          // Check if we should iterate: no value feature means infrastructure-only sprint
          // and more work is needed, unless we've hit the max iteration limit
          if (!hasValueFeature && totalItems > 0 && currentIteration < MAX_SPRINT_ITERATIONS) {
            const nextIteration = currentIteration + 1;
            this._logger.log(
              `[Worker] Sprint iteration: Sprint ${currentIteration} had no value features. Looping to Sprint ${nextIteration} (max: ${MAX_SPRINT_ITERATIONS})`
            );
            await this._supabase
              .from('ventures')
              .update({
                metadata: { ...(ventureRecord?.metadata || {}), sprint_iteration: nextIteration },
              })
              .eq('id', ventureId);
            // Stay at Stage 19 — do not advance
            continue;
          }

          if (currentIteration >= MAX_SPRINT_ITERATIONS) {
            this._logger.warn(
              `[Worker] Sprint iteration LIMIT reached (${MAX_SPRINT_ITERATIONS}) for venture ${ventureId}. Forcing advance to Stage 20.`
            );
          }

          // Reset sprint iteration counter before advancing past Stage 19
          if (currentIteration > 0) {
            await this._supabase
              .from('ventures')
              .update({
                metadata: { ...(ventureRecord?.metadata || {}), sprint_iteration: 0 },
              })
              .eq('id', ventureId);
          }
        }

        // Check for lifecycle completion or determine next stage
        if (currentStage >= MAX_STAGE) {
          this._logger.log(`[Worker] Venture ${ventureId} completed lifecycle at stage ${currentStage}`);
          await markCompleted(this._supabase, ventureId, { lockId, logger: this._logger });
          this._activeVentures.delete(ventureId);
          return lastResult;
        }

        if (result.nextStageId) {
          // Filter engine set nextStageId and already advanced DB — fire hooks for completed stage
          await this._runPostStageHooks(ventureId, currentStage);
          currentStage = result.nextStageId;
        } else {
          // nextStageId not set — check if the DB was advanced by the filter engine,
          // otherwise explicitly advance to the next stage.
          // RCA PAT-ORCH-STATE-001: Without explicit advancement, the worker would
          // re-read the DB, find no advancement, and incorrectly mark the venture
          // as lifecycle-complete even though it's mid-pipeline.
          const { data: refreshed } = await this._supabase
            .from('ventures')
            .select('current_lifecycle_stage')
            .eq('id', ventureId)
            .single();
          const dbStage = refreshed?.current_lifecycle_stage;
          if (dbStage && dbStage > currentStage) {
            this._logger.log(`[Worker] DB stage advanced to ${dbStage} (was ${currentStage}) — continuing`);
            await this._runPostStageHooks(ventureId, currentStage);
            currentStage = dbStage;
          } else {
            // DB stage didn't advance — explicitly advance to next stage via SAE
            const nextStage = currentStage + 1;
            if (nextStage > MAX_STAGE) {
              this._logger.log(`[Worker] Venture ${ventureId} completed lifecycle at stage ${currentStage}`);
              await markCompleted(this._supabase, ventureId, { lockId, logger: this._logger });
              this._activeVentures.delete(ventureId);
              return lastResult;
            }
            await this._advanceStage(ventureId, currentStage, nextStage, { durationMs: stageDurationMs, result, advancementType: 'normal' });
            currentStage = nextStage;
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
        const provisionerPath = new URL('./bridge/venture-provisioner.js', import.meta.url);
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
      const shouldAutoApprove = await this._canAutoAdvance(stageNumber);
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
   * SD-FIX-WORKER-STARTUP-LOCK-RECOVERY-001: Reset ventures stuck in processing
   * state from previous worker instances. Called once at startup before the first
   * poll tick. Only resets ventures whose lock_id does not match this worker.
   */
  async _onStartupRecovery() {
    try {
      const { data: orphaned, error } = await this._supabase
        .from('ventures')
        .select('id, name, orchestrator_lock_id')
        .eq('orchestrator_state', ORCHESTRATOR_STATES.PROCESSING)
        .neq('orchestrator_lock_id', this._workerId);

      if (error) {
        this._logger.warn(`[Worker] Startup recovery query failed: ${error.message}`);
        return;
      }

      if (!orphaned || orphaned.length === 0) return;

      for (const venture of orphaned) {
        this._logger.warn(
          `[Worker] Startup recovery: resetting ${venture.name || venture.id} ` +
          `(stale lock_id=${venture.orchestrator_lock_id})`
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
          this._logger.error(`[Worker] Startup recovery reset failed for ${venture.id}: ${resetError.message}`);
        } else {
          await emit(this._supabase, 'startup_recovery_lock_released', {
            ventureId: venture.id,
            ventureName: venture.name,
            staleLockId: venture.orchestrator_lock_id,
            releasedBy: this._workerId,
          }, 'stage-execution-worker').catch(() => {});
        }
      }

      this._logger.log(`[Worker] Startup recovery complete: ${orphaned.length} venture(s) reset`);
    } catch (err) {
      this._logger.error(`[Worker] Startup recovery error: ${err.message}`);
    }
  }

  /**
   * Safety net: find ventures stuck in 'blocked' state whose blocking condition
   * has been resolved by an external process (e.g., rescan_stage_20 RPC).
   *
   * Detects ventures where orchestrator_state='blocked' but venture_stage_work
   * for the PREVIOUS stage shows stage_status='completed'. This means an external
   * process advanced the stage but didn't reset orchestrator_state.
   *
   * RCA: PAT-ORCH-STATE-001 — External advancement bypassing orchestrator state machine
   */
  async _checkResolvedBlocks() {
    try {
      const { data: blocked } = await this._supabase
        .from('ventures')
        .select('id, name, current_lifecycle_stage')
        .eq('status', 'active')
        .eq('orchestrator_state', ORCHESTRATOR_STATES.BLOCKED);

      if (!blocked || blocked.length === 0) return;

      for (const venture of blocked) {
        const prevStage = venture.current_lifecycle_stage - 1;
        if (prevStage < 1) continue;

        const { data: prevWork } = await this._supabase
          .from('venture_stage_work')
          .select('stage_status')
          .eq('venture_id', venture.id)
          .eq('lifecycle_stage', prevStage)
          .maybeSingle();

        if (prevWork?.stage_status === 'completed') {
          // SD-WORKER-GATE-FIX-KILL-ORCH-001-B: Check for pending chairman decision
          // before resetting to IDLE. Without this guard, the worker spin-loops:
          // unblock → hit chairman gate → re-block → unblock (every 30s).
          const { data: pendingDecision } = await this._supabase
            .from('chairman_decisions')
            .select('id')
            .eq('venture_id', venture.id)
            .eq('lifecycle_stage', venture.current_lifecycle_stage)
            .eq('status', 'pending')
            .limit(1)
            .maybeSingle();

          if (pendingDecision) {
            this._logger.log(
              `[Worker] Keeping ${venture.name || venture.id} blocked: pending chairman decision ` +
              `(${pendingDecision.id}) for Stage ${venture.current_lifecycle_stage}`
            );
            continue;
          }

          this._logger.log(
            `[Worker] Unblocking ${venture.name || venture.id}: Stage ${prevStage} completed externally, ` +
            `resetting orchestrator_state to idle for Stage ${venture.current_lifecycle_stage}`
          );
          await this._supabase
            .from('ventures')
            .update({
              orchestrator_state: ORCHESTRATOR_STATES.IDLE,
              orchestrator_lock_id: null,
              orchestrator_lock_acquired_at: null,
            })
            .eq('id', venture.id)
            .eq('orchestrator_state', ORCHESTRATOR_STATES.BLOCKED);
        }
      }
    } catch (err) {
      this._logger.warn(`[Worker] Resolved-blocks sweep error: ${err.message}`);
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

  // ── Stage Advancement Engine (SAE) ─────────────────────���────────────

  /**
   * SAE: Unified stage advancement with 5 mandatory side-effects.
   * ALL advancement paths MUST go through this method.
   * PAT-TAXONOMY-COLLISION-001: Prevents post-stage hook skip regression.
   *
   * @param {string} ventureId
   * @param {number} fromStage - Stage being completed
   * @param {number} toStage - Stage being advanced to
   * @param {Object} [context={}]
   * @param {Object} [context.result] - Stage processing result
   * @param {number} [context.durationMs=0] - Stage execution duration
   * @param {string} [context.advancementType='normal'] - One of: normal, governance_override, auto_approved, re_entry, review_approved, pre_exec_skip
   */
  async _advanceStage(ventureId, fromStage, toStage, context = {}) {
    const { result = null, durationMs = 0, advancementType = 'normal' } = context;

    // Side-effect 1: Update ventures.current_lifecycle_stage
    await this._supabase
      .from('ventures')
      .update({ current_lifecycle_stage: toStage })
      .eq('id', ventureId);

    // Side-effect 2: Mark venture_stage_work as completed
    await this._supabase
      .from('venture_stage_work')
      .update({ stage_status: 'completed', completed_at: new Date().toISOString() })
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', fromStage);

    // Side-effect 3: Audit log
    this._logStageTransition(ventureId, fromStage, 'completed', durationMs, result).catch(() => {});

    // Side-effect 4: Post-stage hooks (Stitch S15, DocGen S17, SD Bridge S19)
    await this._runPostStageHooks(ventureId, fromStage);

    // Side-effect 5: Record advancement type in advisory_data
    try {
      const { data: existing } = await this._supabase
        .from('venture_stage_work')
        .select('advisory_data')
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', fromStage)
        .maybeSingle();
      await this._supabase
        .from('venture_stage_work')
        .update({ advisory_data: { ...(existing?.advisory_data || {}), advancement_type: advancementType } })
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', fromStage);
    } catch (err) {
      this._logger.warn(`[SAE] Decision recording failed (non-fatal): ${err.message}`);
    }

    // Side-effect 6: Audit trail — venture_stage_transitions record
    // SD-LEO-FIX-EVA-STAGE-WORKER-001: Previously only the RPC path (via
    // artifact-persistence-service.js) wrote transitions. This fast-path
    // was missing them, causing gaps at gate-override boundaries.
    try {
      // Dedup guard: prevent duplicate transition records from chairman re-clicks
      const { data: existingTransition } = await this._supabase
        .from('venture_stage_transitions')
        .select('id')
        .eq('venture_id', ventureId)
        .eq('from_stage', fromStage)
        .eq('to_stage', toStage)
        .limit(1)
        .maybeSingle();

      if (!existingTransition) {
        await this._supabase
          .from('venture_stage_transitions')
          .insert({
            venture_id: ventureId,
            from_stage: fromStage,
            to_stage: toStage,
            transition_type: advancementType === 'governance_override' ? 'skip' : 'normal',
          });
      }
    } catch (transErr) {
      this._logger.warn(`[SAE] Transition record failed (non-fatal): ${transErr.message}`);
    }

    this._logger.log(`[SAE] Advanced S${fromStage} → S${toStage} (type=${advancementType}, venture=${ventureId.slice(0, 8)})`);
  }

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
  /**
   * S15 post-stage hook: Provision Stitch design project via stitch-provisioner.
   * SD-LEO-FIX-FIX-STAGE-VENTURE-001: Wire postStage15Hook into pipeline.
   */
  async _postStageHook_S15_StitchProvision(ventureId) {
    // SD-LEO-FIX-STITCH-INTEGRATION-WIRING-001: Route through provisioner for full business logic + artifact storage
    const { postStage15Hook } = await import('./bridge/stitch-provisioner.js');
    const { logStitchEvent } = await import('./bridge/stitch-adapter.js');
    const { data: s15Work } = await this._supabase
      .from('venture_stage_work')
      .select('advisory_data')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 15)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const result = await postStage15Hook(ventureId, s15Work);

    // Fallback: when Stitch unavailable, continue with ASCII wireframes
    if (result?.status === 'unavailable' || result?.status === 'no_op') {
      logStitchEvent({ event: 's15_fallback', ventureId, stage: 15, status: 'fallback_ascii' });
      this._logger.warn(`[Worker] S15 Stitch unavailable (${result.reason || result.status}), continuing with ASCII wireframes`);
      await this._supabase
        .from('venture_stage_work')
        .update({
          advisory_data: {
            ...(s15Work?.advisory_data || {}),
            stitch_hook_status: 'unavailable',
            stitch_fallback: 'ascii_wireframes',
          },
        })
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', 15)
        .order('created_at', { ascending: false })
        .limit(1);
      return; // S15 continues normally with ASCII wireframes
    }

    this._logger.log(`[Worker] S15 post-stage hook: stitch provisioner ${result?.status || 'completed'}`);
    if (s15Work) {
      await this._supabase
        .from('venture_stage_work')
        .update({
          advisory_data: {
            ...(s15Work?.advisory_data || {}),
            stitch_hook_status: result?.status || 'completed',
          },
        })
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', 15)
        .order('created_at', { ascending: false })
        .limit(1);
    }
  }

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

    // SD-LEO-FIX-STITCH-INTEGRATION-WIRING-001: Look up stitch_project artifact for project_id
    try {
      const { exportScreens, logStitchEvent } = await import('./bridge/stitch-adapter.js');
      const { data: stitchArtifact } = await this._supabase
        .from('venture_artifacts')
        .select('artifact_data')
        .eq('venture_id', ventureId)
        .eq('artifact_type', 'stitch_project')
        .maybeSingle();

      const projectId = stitchArtifact?.artifact_data?.project_id || null;
      if (!projectId) {
        const wireframeGating = process.env.EVA_WIREFRAME_GATING_ENABLED === 'true';
        if (wireframeGating) {
          this._logger.error('[Worker] S17 no stitch_project artifact found — fail-closed (EVA_WIREFRAME_GATING_ENABLED=true)');
          throw new Error('[Worker] S17 export blocked: no stitch_project artifact (wireframe gating enabled)');
        }
        this._logger.warn('[Worker] S17 no stitch_project artifact found, skipping Stitch export');
        return;
      }

      const exportResult = await exportScreens(ventureId, projectId);
      if (exportResult?.status === 'unavailable') {
        logStitchEvent({ event: 's17_fallback', ventureId, stage: 17, status: 'fallback_skip_export' });
        const wireframeGating = process.env.EVA_WIREFRAME_GATING_ENABLED === 'true';
        if (wireframeGating) {
          this._logger.error(`[Worker] S17 Stitch export unavailable — fail-closed (EVA_WIREFRAME_GATING_ENABLED=true, reason=${exportResult.reason})`);
          throw new Error(`[Worker] S17 export blocked: Stitch unavailable (${exportResult.reason}, wireframe gating enabled)`);
        }
        this._logger.warn(`[Worker] S17 Stitch export unavailable (${exportResult.reason}), skipping design artifacts`);
      } else {
        this._logger.log('[Worker] S17 post-stage hook: stitch design artifacts exported');
      }
    } catch (err) {
      if (err.message?.includes('wireframe gating enabled')) throw err;
      this._logger.warn(`[Worker] S17 stitch export failed (non-blocking): ${err.message}`);
    }
  }

  /**
   * S19 post-stage hook: Convert sprint plan → LEO Strategic Directives via lifecycle-sd-bridge.
   * Queries S19 artifacts for sd_bridge_payloads, creates orchestrator + child SDs.
   * @param {string} ventureId
   */
  async _postStageHook_S19_Bridge(ventureId) {
    const { data: ventureRow } = await this._supabase
      .from('ventures').select('name').eq('id', ventureId).single();

    // SD-LEO-INFRA-REPLIT-ALTERNATIVE-BUILD-001: Check build_method before SD bridge
    // When build_method is 'replit_agent', skip SD creation entirely — the venture
    // will be built in Replit and imported back via the re-entry adapter.
    const { data: s19Work } = await this._supabase
      .from('venture_stage_work')
      .select('advisory_data')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 19)
      .maybeSingle();

    const buildMethod = s19Work?.advisory_data?.build_method;
    if (buildMethod === 'replit_agent') {
      this._logger.log(
        '[Worker] S19 Bridge: build_method=replit_agent — skipping SD creation. Venture will be built in Replit.'
      );
      // Write the build_method to Stage 20 so BUILD_PENDING knows to check Replit sync
      await this._supabase
        .from('venture_stage_work')
        .upsert({
          venture_id: ventureId,
          lifecycle_stage: 20,
          stage_status: 'in_progress',
          work_type: 'sd_required',
          advisory_data: { build_method: 'replit_agent', awaiting_replit_sync: true },
        }, { onConflict: 'venture_id,lifecycle_stage' });
      return;
    }

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

      // SD-LEO-INFRA-REPLIT-ALTERNATIVE-BUILD-001: Check build_method for Replit path
      const buildMethod = stageWork?.advisory_data?.build_method || 'claude_code';
      if (buildMethod === 'replit_agent') {
        return this._checkReplitBuildPending(ventureId, stageWork);
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
   * SD-LEO-INFRA-REPLIT-ALTERNATIVE-BUILD-001: Check Replit build pending status.
   * For Replit builds, checks GitHub sync + verification SD completion
   * instead of regular SD terminal state.
   * @param {string} ventureId
   * @param {object} stageWork - venture_stage_work row for stage 20
   * @returns {Promise<Object>}
   */
  async _checkReplitBuildPending(ventureId, stageWork) {
    const result = { blocked: false, totalCount: 0, nonTerminalCount: 0, healthScore: 'green' };
    const replitSync = stageWork?.advisory_data?.replit_sync;

    // Check 1: Has code been synced from Replit to GitHub?
    if (!replitSync || !replitSync.last_commit_sha) {
      this._logger.log(
        '[Worker] Stage 20 REPLIT_BUILD_PENDING: No GitHub sync detected — waiting for Replit push'
      );
      result.blocked = true;
      result.totalCount = 1;
      result.nonTerminalCount = 1;
      return result;
    }

    this._logger.log(
      `[Worker] Stage 20 REPLIT_BUILD_PENDING: GitHub sync detected (${replitSync.last_commit_sha.slice(0, 7)} on ${replitSync.branch || 'unknown'})`
    );

    // Check 2: Are verification SDs complete?
    const { data: verificationSDs } = await this._supabase
      .from('strategic_directives_v2')
      .select('sd_key, status')
      .eq('venture_id', ventureId)
      .like('sd_key', '%VERIFY%');

    if (!verificationSDs || verificationSDs.length === 0) {
      // No verification SDs yet — they may need to be created
      this._logger.log(
        '[Worker] Stage 20 REPLIT_BUILD_PENDING: GitHub synced but no verification SDs found — waiting for verification SD generation'
      );
      result.blocked = true;
      result.totalCount = 1;
      result.nonTerminalCount = 1;
      return result;
    }

    result.totalCount = verificationSDs.length;
    const terminalStatuses = new Set(['completed', 'cancelled']);
    const nonTerminal = verificationSDs.filter(sd => !terminalStatuses.has(sd.status));
    result.nonTerminalCount = nonTerminal.length;

    if (nonTerminal.length > 0) {
      result.blocked = true;
      this._logger.log(
        `[Worker] Stage 20 REPLIT_BUILD_PENDING: ${nonTerminal.length}/${verificationSDs.length} verification SD(s) not terminal — blocking`
      );
    } else {
      this._logger.log(
        `[Worker] Stage 20 REPLIT_BUILD_PENDING: all ${verificationSDs.length} verification SD(s) terminal — Replit build complete`
      );
    }

    return result;
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
  async _canAutoAdvance(stageNumber) {
    try {
      const { data, error } = await this._supabase
        .from('chairman_dashboard_config')
        .select('global_auto_proceed, hard_gate_stages, stage_overrides')
        .eq('config_key', 'default')
        .maybeSingle();

      if (error || !data) {
        this._logger.warn('[SAE] canAutoAdvance: config query failed, defaulting to block');
        return false;
      }

      // Layer 1: Global toggle must be on
      if (!data.global_auto_proceed) {
        this._logger.log(`[SAE] canAutoAdvance(${stageNumber}): blocked — global_auto_proceed=false`);
        return false;
      }

      // Layer 2: Hard gate stages NEVER auto-approve
      const hardGates = data.hard_gate_stages || [];
      if (hardGates.includes(stageNumber)) {
        this._logger.log(`[SAE] canAutoAdvance(${stageNumber}): blocked — in hard_gate_stages ${JSON.stringify(hardGates)}`);
        return false;
      }

      // Layer 3: Per-stage override
      const override = data.stage_overrides?.[`stage_${stageNumber}`];
      if (override && override.auto_proceed === false) {
        this._logger.log(`[SAE] canAutoAdvance(${stageNumber}): blocked — stage_override (reason: ${override.reason || 'none'})`);
        return false;
      }

      this._logger.log(`[SAE] canAutoAdvance(${stageNumber}): approved — all governance layers passed`);
      return true;
    } catch (err) {
      this._logger.warn(`[SAE] canAutoAdvance threw: ${err.message}`);
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

    // For chairman gate stages AND review-mode stages, mark as blocked (awaiting chairman approval)
    // Skip override when gate was already auto-approved (Bug 1 fix: QF-20260320-509)
    // SD-LEO-INFRA-UNIFIED-GATE-ENFORCEMENT-001: include REVIEW_MODE_STAGES in gate check
    const isGateStage = CHAIRMAN_GATES.BLOCKING.has(stageNumber) || REVIEW_MODE_STAGES.has(stageNumber) || await this._isInHardGateStages(stageNumber);
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
