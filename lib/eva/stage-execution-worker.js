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
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';
import {
  acquireProcessingLock,
  releaseProcessingLock,
  markCompleted,
  ORCHESTRATOR_STATES,
} from './orchestrator-state-machine.js';
import {
  createOrReusePendingDecision,
  waitForDecision,
  isDecisionCreatingStage,
  extractGateQuality,
} from './chairman-decision-watcher.js';
import { emit } from './shared-services.js';
import { checkAutonomy } from './autonomy-model.js';
import { S20PauseController } from './s20-pause-controller.js';
// SD-LEO-INFRA-VENTURE-DATA-CAPTURE-EMISSION-001-B (SD-0b): derive + additively merge the
// real-vs-simulated build_kind tag onto every stage_executions emission (entry/exit). Both
// helpers are pure + fail-soft — a derivation error returns null (emit untagged), never throws.
import { deriveBuildKind, mergeBuildKind } from './build-kind-tag.mjs';

import { hostname } from 'os';
import { createServer } from 'http';
import { OPERATING_MODES } from './gate-constants.js';
import { getStageGovernance } from './stage-governance.js';
import { extractKillGateVerdict } from './kill-override-guard.js';
// SD-LEO-INFRA-RUN-STAGE-FAITHFUL-PERSIST-001: the venture_stage_work write-through
// + hard-gate check were extracted to a shared module so run-stage/executeStage
// produce the SAME stage-completion records as this daemon (single source of truth).
import { syncStageWork as syncStageWorkShared, isInHardGateStages as isInHardGateStagesShared } from './stage-work-sync.js';
import { shouldOpenChairmanGate, canAdvancePastBuildCheckpoint } from './should-open-chairman-gate.js';
import { toValidTransitionType } from './transition-type.js';
// SD-LEO-INFRA-HARDEN-S19-S20-001 (FR-1): the single pure bridge-outcome classifier + S19
// hold/advance decision shared by every S19 gate consumer (closes RCA 7610876f schism).
import { classifyBridgeOutcome, shouldHoldAtS19, S19_BRIDGE_OUTCOME } from './bridge/s19-advance-decision.js';
// SD-ARCH-HOTSPOT-STAGE-WORKER-001: post-stage hook bodies for S11/S15/S17 relocated to
// lib/eva/stage-handlers/ (FR-2); dispatch via the externalized registry (FR-3). Both the
// registry path and the kill-switch (STAGE_HANDLER_REGISTRY=off) legacy Map path call the
// SAME handler modules — single implementation, dispatch mechanism is the only toggle.
import * as stageHandlerRegistry from './stage-handlers/registry.js';
import * as stageHandlersS11 from './stage-handlers/s11.js';
import * as stageHandlersS15 from './stage-handlers/s15.js';
import * as stageHandlersS17 from './stage-handlers/s17.js';
// SD-ARCH-HOTSPOT-STAGE-WORKER-001 (FR-1): formatDuration relocated to shared util.
import { formatDuration } from './util.js';
// SD-LEO-INFRA-VISION-GROUNDED-ACCEPTANCE-001 (FR-2): vision-grounded acceptance gate (pure decision).
import { shouldHoldForVisionAcceptance, isVisionAcceptanceGateEnabled, isVisionAcceptanceStrict } from './bridge/vision-acceptance-gate.js';
import { shouldHoldForVisionDrift, isVisionDriftGateEnabled, isVisionDriftStrict, DRIFT_HOLD_CAUSE } from './bridge/vision-drift-gate.js';
import { canAutoAdvance } from './governance/can-auto-advance.js';
// SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001 (FR-2): _advanceStage is the daemon-walk's single
// side-effecting advance for ALL stages -- an independent JS-side mirror of the RPC-side artifact
// gate (fn_advance_venture_stage) closes this path's bypass, matching the S19/product-review
// backstops' own established "independent choke point" convention.
import { checkStageArtifactPrecondition } from './stage-artifact-precondition.js';
// SD-LEO-INFRA-LEO-BRIDGE-MODEL-001 (FR-2): seed-completeness check at S19 entry, for
// ANY build_model with a resolvable local clone -- closes the gap class where a venture
// reaches S19 without its Claude-Code-ready scaffold (previously only leo_bridge ventures
// were affected, because they never ran seedRepo() nor the new scaffold_seeded step).
import { resolveRepoPathDbFirst } from '../repo-paths.js';
import { SEEDED_ARTIFACTS } from './bridge/repo-readiness.js';
import { existsSync } from 'fs';
import { join as pathJoin } from 'path';
// SD-LEO-INFRA-CLONE-VISION-AUTOPROMOTE-QUALITY-REPAIR-001: the existing bounded vision repair loop —
// wired into the clone auto-promote so a draft_seed seed with <8 standard sections is repaired to
// quality_checked=true BEFORE the status='active' promote (which trg_enforce_vision_quality_advancement
// otherwise blocks). Re-uses the existing loop; does NOT re-implement repair.
import { repairVision, isRepairLoopEnabled } from './vision-repair-loop.js';
// SD-LEO-INFRA-NONCLONE-VISION-S19-ACTIVATION-BLOCK-001: a non-clone CONVERGENCE SUBJECT is auto-approve-
// eligible at S19 (the non-clone analogue of a clone origin) so its quality-passed vision activates on the
// normal path; a real venture (neither clone nor convergence subject) stays chairman-manual.
import { isConvergenceSubject } from './clean-clone/launch.js';
import { runS19ConvergenceGate } from './post-build-convergence-gate.js';
import { emitTraversalReflection } from './traversal-reflection-emitter.js';

// ── Constants ───────────────────────────────────────────────

const MAX_STAGE = 26;
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const DEFAULT_GATE_TIMEOUT_MS = 0; // 0 = wait indefinitely
const DEFAULT_STALE_LOCK_THRESHOLD_MS = 120_000; // 2 minutes (was 5 min; reduced to speed recovery after worker restart)
const DEFAULT_STALL_THRESHOLD_MS = 300_000; // 5 minutes
const DEFAULT_HEALTH_PORT = 3001;
const DEFAULT_EXEC_HEARTBEAT_MS = 15_000; // heartbeat every 15s during stage processing
const MAX_SPRINT_ITERATIONS = 5; // SD-LEO-ORCH-VENTURE-FACTORY-OUTPUT-QUALITY-001-D: safety limit for sprint iteration loop
const WORKER_VERSION = '1.2.0';

// Gate sets are sourced from stage-governance.js (single DB-backed source of truth via stage_config).
// Only OPERATING_MODES + TASTE_GATE_STAGES + MAX_STAGE remain in gate-constants.js (out of scope here).

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
 * SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001-C / FR-3: durable accidental-resume guard.
 *
 * A venture marked `metadata.frozen === true` is a dogfood-complete / superseded
 * venture (e.g. venture-1, frozen at S19; the clean clone supersedes it). The
 * stage-execution worker must NEVER advance it or unblock it, regardless of how
 * its orchestrator_state churns. Null-safe: a missing/empty metadata object is
 * NOT frozen, so normal ventures are unaffected.
 *
 * @param {{metadata?: Object}} venture
 * @returns {boolean}
 */
export function isVentureFrozen(venture) {
  return venture?.metadata?.frozen === true;
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

    /** @type {Promise|null} - Track active processing for graceful shutdown */
    this._processingPromise = null;

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
      // SD-ARCH-HOTSPOT-STAGE-WORKER-001: S11/S15/S17 entries call the relocated
      // handler modules (lib/eva/stage-handlers/) — the load-bearing hook ORDER and
      // its rationale live in each module's execute(). This Map is the kill-switch
      // (STAGE_HANDLER_REGISTRY=off) dispatch path; the enabled path routes through
      // stage-handlers/registry.js runStageHandler in _runPostStageHooks. S19 stays
      // in-worker (deep _runS19Bridge coupling — PRD conditional-relocation clause).
      [11, (ventureId) => stageHandlersS11.execute(this._stageHandlerCtx(ventureId))],
      [15, (ventureId) => stageHandlersS15.execute(this._stageHandlerCtx(ventureId))],
      [17, (ventureId) => stageHandlersS17.execute(this._stageHandlerCtx(ventureId))],
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
   * Graceful: aborts active ventures, then waits for their finally blocks
   * to release processing locks before returning. This prevents orphaned
   * locks on worker restart (QF: stale orchestrator lock fix).
   */
  async stop() {
    if (!this._running) return;

    this._running = false;
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    // Abort all active ventures — triggers loop break at abort signal check
    for (const [ventureId, controller] of this._activeVentures) {
      this._logger.log(`[Worker] Aborting venture ${ventureId}`);
      controller.abort();
    }

    // Wait for the active processing promise to complete its finally block
    // (which releases the processing lock). Timeout at 3s to avoid hanging.
    if (this._processingPromise) {
      try {
        await Promise.race([
          this._processingPromise,
          new Promise(resolve => setTimeout(resolve, 3000)),
        ]);
      } catch {
        // Swallow errors — we just need the finally block to run
      }
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
        this._processingPromise = this._processVenture(venture.id);
        await this._processingPromise;
        this._processingPromise = null;
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
      // Paginated (FR-6 batch 7): this poll SELECTS WORK — a capped read would
      // silently strand ready ventures. Page errors throw into the catch below
      // (empty poll, prior policy).
      const data = await fetchAllPaginated(() => this._supabase
        .from('ventures')
        .select('id, name, current_lifecycle_stage, metadata')
        .eq('status', 'active')
        .eq('orchestrator_state', ORCHESTRATOR_STATES.IDLE)
        .lt('current_lifecycle_stage', MAX_STAGE)
        .order('current_lifecycle_stage', { ascending: true })
        .order('id', { ascending: true }));

      // SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001-C / FR-3: never advance a frozen
      // (dogfood-complete / superseded) venture. Filter in JS — a PostgREST
      // neq on metadata->>frozen would also drop null-metadata rows. The frozen
      // venture stays parked at its current stage forever.
      const ready = (data || []).filter((v) => {
        if (isVentureFrozen(v)) {
          this._logger.log(`[Worker] Skipping frozen venture ${v.name || v.id} (dogfood-complete; not advanced)`);
          return false;
        }
        return true;
      });

      return ready;
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

        // SD-LEO-INFRA-LEO-BRIDGE-MODEL-001 (FR-2): seed-completeness check, ANY build_model.
        // SELF-HEALS on a miss (writes the missing scaffold via ensureLeoBridgeScaffold, the
        // SAME writer the provisioning step machine uses) and only blocks if the write itself
        // fails. An adversarial review of the first version of this gate (read-only: block
        // immediately, never remediate) found it could PERMANENTLY deadlock any venture found
        // missing its scaffold — the only code that could have fixed it (provisionVenture's
        // scaffold_seeded step) runs LATER in this same loop tick, so an unconditional `break`
        // here meant that code never got a chance to run, on this tick or any future one.
        // Self-healing here also closes the original QF-20260706-168 gap for good: an
        // ALREADY-provisioned venture (e.g. MarketLens) can never reach provisionVenture()'s
        // DEFAULT_STEPS at all (both _verifyAndProvisionVenture's 'provisioned' short-circuit
        // and provisionVenture's own 'completed' status early-return skip it entirely) — this
        // is the only path that retroactively fixes such ventures once this SD ships.
        if (currentStage === 19) {
          try {
            const repoPath = await resolveRepoPathDbFirst(venture.name, this._supabase);
            if (repoPath && existsSync(repoPath)) {
              let missing = SEEDED_ARTIFACTS.filter((f) => !existsSync(pathJoin(repoPath, ...f.split('/'))));
              if (missing.length > 0) {
                this._logger.warn(`[Worker] S19 SCAFFOLD-COMPLETENESS gate: venture ${ventureId} missing ${missing.join(', ')} at ${repoPath} — self-healing.`);
                const { ensureLeoBridgeScaffold } = await import('./bridge/venture-provisioner.js');
                await ensureLeoBridgeScaffold(ventureId, repoPath, {
                  ventureName: venture.name,
                  supabase: this._supabase,
                  logger: (m) => this._logger.log(`[Worker] ${m}`),
                });
                missing = SEEDED_ARTIFACTS.filter((f) => !existsSync(pathJoin(repoPath, ...f.split('/'))));
              }
              if (missing.length > 0) {
                // Self-heal itself failed to produce the files (e.g. a filesystem error) —
                // THIS is a genuine block-worthy condition, not the routine first-miss case.
                this._logger.error(`[Worker] S19 SCAFFOLD-COMPLETENESS gate: self-heal did not resolve ${missing.join(', ')} at ${repoPath} — blocking S19 advance.`);
                const { data: existingRow } = await this._supabase
                  .from('venture_stage_work')
                  .select('advisory_data')
                  .eq('venture_id', ventureId).eq('lifecycle_stage', 19).maybeSingle();
                await this._supabase.from('venture_stage_work').upsert({
                  venture_id: ventureId,
                  lifecycle_stage: 19,
                  stage_status: 'blocked',
                  work_type: 'sd_required',
                  // Merge, not replace — a sibling gate (_blockS19LeoBridge) may already have
                  // written chairman-facing vision_pending data into this same row's key.
                  advisory_data: { ...(existingRow?.advisory_data || {}), reason: 'scaffold_incomplete', missing_files: missing, repo_path: repoPath },
                }, { onConflict: 'venture_id,lifecycle_stage' });
                releaseState = ORCHESTRATOR_STATES.BLOCKED;
                lastResult = { ventureId, stageId: 19, status: 'blocked', gate: 'scaffold_incomplete', missing };
                break;
              }
            }
          } catch (e) {
            // Unresolvable path or a query error is NOT this gate's failure mode to enforce —
            // fail-open (log only) so a resolver hiccup never blocks an otherwise-healthy venture.
            this._logger.warn(`[Worker] S19 scaffold-completeness check failed (non-fatal, fail-open): ${e.message}`);
          }
        }

        // SD-LEO-INFRA-HARDEN-S19-S20-001 (FR-2): DECISION-STATE-INDEPENDENT hard pre-advance S19
        // invariant gate. A leo_bridge venture MUST NOT pass Stage 19 until its orchestrator + all
        // child SDs are complete. Predecessor SD-LEO-INFRA-ENFORCE-S19-COMPLETION-001 only blocked
        // INSIDE if(approvedS19); RCA 7610876f proved that a CANCELLED/absent S19 chairman_decision
        // skipped the block entirely, letting DataDistill advance to S20 with a 26-SD all-draft tree.
        // We now run the bridge idempotently (creating SDs if the L2 vision is now chairman-approved),
        // then HOLD via the single shared decision regardless of decision state. Non-leo_bridge
        // ventures (_isLeoBridgeBuildComplete===null) and the NOOP_EMPTY 0-payload case fall through.
        if (currentStage === 19) {
          const s19Complete = await this._isLeoBridgeBuildComplete(ventureId);
          if (s19Complete === false) {
            // Run-then-recheck (preserved from the predecessor FR-1): idempotently (re)run the
            // bridge first so a just-approved vision gets its SDs created BEFORE we evaluate
            // completeness — never block a fresh arrival before the bridge has had its chance.
            let bridgeOutcome;
            try {
              const bridge = await this._runS19Bridge(ventureId);
              bridgeOutcome = bridge.outcome;
            } catch (e) {
              this._logger.warn(`[Worker] S19 hard gate: bridge run failed (non-fatal): ${e.message}`);
              bridgeOutcome = S19_BRIDGE_OUTCOME.ZERO_SDS_FAILURE; // a thrown bridge built nothing → hold
            }
            const recheck = await this._isLeoBridgeBuildComplete(ventureId);
            if (shouldHoldAtS19(bridgeOutcome, recheck)) {
              this._logger.warn(
                `[Worker] S19 HARD GATE (SD-LEO-INFRA-HARDEN-S19-S20-001): leo_bridge build NOT complete (outcome=${bridgeOutcome}, buildComplete=${recheck}) — refusing to advance venture ${ventureId} past Stage 19 regardless of decision state.`
              );
              await this._blockS19LeoBridge(ventureId, ['s19_sd_completion_invariant']);
              await this._emitS19HardGateEvent(ventureId, 'S19_HARD_GATE_BLOCK', {
                build_complete: recheck, bridge_outcome: bridgeOutcome,
                reason: 's19_sd_completion_invariant', decided_by: 'fr1_entry_hard_gate',
              });
              releaseState = ORCHESTRATOR_STATES.BLOCKED;
              lastResult = { ventureId, stageId: currentStage, status: 'blocked', gate: 's19_sd_completion_invariant' };
              break;
            }
          }
          // SD-LEO-INFRA-RESERVED-GATE-BYPASS-001 (FR-2): the BUILD-CHECKPOINT hard invariant —
          // the leo_bridge build-readiness gate (above) is NOT the chairman's go/no-go. On a
          // RE-ENTRY where S19 has already produced an artifact, refuse to advance past S19 unless
          // an APPROVED S19 chairman_decision also exists (fail-CLOSED on the chairman approval).
          // Gated on an existing artifact so a first arrival still runs its producer + mints the
          // pending gate via FR-1 (never a content-less gate).
          {
            const { data: s19Art } = await this._supabase
              .from('venture_artifacts')
              .select('id').eq('venture_id', ventureId).eq('lifecycle_stage', 19).eq('is_current', true).limit(1);
            if (s19Art && s19Art.length > 0) {
              const { data: s19Approved } = await this._supabase
                .from('chairman_decisions')
                .select('id').eq('venture_id', ventureId).eq('lifecycle_stage', 19)
                .eq('status', 'approved').neq('decision_type', 'advisory').limit(1).maybeSingle();
              const buildComplete = (await this._isLeoBridgeBuildComplete(ventureId)) !== false;
              if (!canAdvancePastBuildCheckpoint({ buildComplete, hasApprovedChairmanDecision: !!s19Approved })) {
                this._logger.warn(
                  `[Worker] S19 BUILD-CHECKPOINT (SD-LEO-INFRA-RESERVED-GATE-BYPASS-001 FR-2): refusing to advance venture ${ventureId} past Stage 19 — approved S19 chairman build-checkpoint decision required (buildComplete=${buildComplete}, approved=${!!s19Approved}). The leo_bridge readiness gate is not a substitute for the chairman go/no-go.`
                );
                await createOrReusePendingDecision({
                  ventureId, stageNumber: 19, decisionType: 'stage_gate',
                  summary: 'S19 build-checkpoint — chairman go/no-go required before BUILD mode',
                  supabase: this._supabase, logger: this._logger,
                }).catch((e) => this._logger.warn(`[Worker] S19 build-checkpoint mint skipped (non-fatal): ${e.message}`));
                releaseState = ORCHESTRATOR_STATES.BLOCKED;
                lastResult = { ventureId, stageId: currentStage, status: 'blocked', gate: 's19_build_checkpoint_chairman' };
                break;
              }
            }
          }

          // SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-D: post-build reconciliation. Fires ONLY once
          // both hard gates above have cleared (leo_bridge build complete + chairman
          // build-checkpoint approved) — never blocks (no releaseState/break), so it cannot
          // regress or over-block any venture's S19->S20 advance. Scoped to convergence-subject
          // ventures only inside runS19ConvergenceGate; every other venture (or a disabled
          // feature flag) is a documented no-op.
          try {
            const gateResult = await runS19ConvergenceGate(this._supabase, ventureId, { logger: this._logger });
            if (gateResult.applicable) {
              this._logger.log(
                `[Worker] S19 post-build convergence gate: venture ${ventureId} status=${gateResult.status} adherence=${gateResult.adherenceScore}`
              );
            }
          } catch (e) {
            this._logger.warn(`[Worker] S19 post-build convergence gate failed (non-fatal, non-blocking): ${e.message}`);
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
            // SD-LEO-FIX-PERSIST-KILL-GATE-001 (FR-5): a chairman approval that
            // advances a venture past a gate is RECORDED first-class on the gate
            // evidence row (who/why/when + decision id) — deliberate build-out
            // forcing becomes auditable and excludable from calibration, instead
            // of being indistinguishable from a silently-ignored failure.
            try {
              const { recordGateOverride } = await import('./artifact-persistence-service.js');
              const { data: decisionFull } = await this._supabase
                .from('chairman_decisions')
                .select('id, decided_by, rationale, override_reason, updated_at')
                .eq('id', universalApproved.id)
                .single();
              for (const dbGateType of ['kill', 'exit', 'entry']) {
                await recordGateOverride(this._supabase, {
                  ventureId,
                  stageNumber: currentStage,
                  gateType: dbGateType,
                  override: {
                    decision_id: universalApproved.id,
                    decided_by: decisionFull?.decided_by || 'chairman',
                    rationale: decisionFull?.override_reason || decisionFull?.rationale || 'chairman approval (build-out forcing)',
                    at: decisionFull?.updated_at || new Date().toISOString(),
                  },
                }).catch(() => null); // fail-soft per gate type (row may not exist)
              }
            } catch (ovErr) {
              this._logger.warn(`[Worker] Gate override recording failed (non-blocking): ${ovErr.message}`);
            }

            const { data: existingArt } = await this._supabase
              .from('venture_artifacts')
              .select('id')
              .eq('venture_id', ventureId)
              .eq('lifecycle_stage', currentStage)
              .eq('is_current', true)
              .limit(1);

            if (existingArt && existingArt.length > 0) {
              // Stage already approved + has artifacts — skip re-execution
              const govEarly = await getStageGovernance(this._supabase);
              // SD-LEO-INFRA-ENFORCE-S19-COMPLETION-001 (FR-3): reconcile the classification schism.
              // isBlocking() is work_type-filtered (S19 work_type='sd_required' => false) while S19 is
              // a configured hard_gate_stage; treating only isBlocking() as authoritative let S19
              // pre_exec_skip-advance (RCA a14ff698). Hard-gate stages must fall through to the
              // side-effect-aware gate-specific guard below (matching this block's own comment).
              // SD-LEO-INFRA-RESERVED-GATE-BYPASS-001 (FR-1c): a decision-creating stage (e.g. S18
              // promotion/artifact_only) must NOT blind skip-and-advance — it must route through the
              // decision-aware guard below so a chairman_decision is recorded (createOrReusePendingDecision
              // reuses an already-approved row, so an approved gate still advances, but never silently).
              const createsDecisionEarly = (await isDecisionCreatingStage(currentStage, this._supabase, { logger: this._logger })).creates_decision;
              const isBlockingGate = govEarly.isBlocking(currentStage) || await this._isInHardGateStages(currentStage) || createsDecisionEarly;
              if (!isBlockingGate) {
                // Non-BLOCKING stages: just advance (no vision side-effects needed)
                this._logger.log(
                  `[Worker] Stage ${currentStage} already approved (decision ${universalApproved.id}) + has artifacts — skipping re-execution, advancing`
                );
                const nextStage = currentStage + 1;
                const advanceResult = await this._advanceStage(ventureId, currentStage, nextStage, { advancementType: 'pre_exec_skip' });
                if (advanceResult?.blocked) {
                  this._logger.log(`[Worker] Stage ${currentStage} advance blocked by artifact gate: ${advanceResult.reason}`);
                  releaseState = ORCHESTRATOR_STATES.BLOCKED;
                  lastResult = { ventureId, stageId: currentStage, status: 'artifact_precondition_unmet', ...advanceResult };
                  break;
                }
                currentStage = nextStage;
                continue;
              }
              // BLOCKING stages fall through to the isPreExecGate block below
              // which handles vision side-effects (S3/S5 un-archive etc.)
            }
          }
        }

        // Gate-specific pre-execution guard: handles pending decisions, vision side-effects
        const gov = await getStageGovernance(this._supabase);
        const isPreExecGate = gov.isReview(currentStage) || gov.isBlocking(currentStage) || await this._isInHardGateStages(currentStage);
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
            //
            // SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 (FR-3 completion, 2nd-pass adversarial-review
            // fix PR #6104): a chairman-designated high-consequence stage's pending decision must
            // NEVER be auto-approved through this canonical-RPC shortcut, even when
            // _canAutoAdvance says yes -- this is the third of three independent auto-approve
            // paths that had to be closed (the other two: the review-mode block ~line 1259 and
            // _handleChairmanGate ~line 2255, both fixed earlier in this same PR). Without this
            // guard, a high-consequence stage that ALSO belongs to hard_gate_stages (or a
            // review-mode stage with an explicit stage_overrides[n].auto_proceed=true) would be
            // held for exactly one tick by the mint fix, then silently auto-approved away on the
            // very next tick by this resolver -- reproducing the same "autonomy defeats the
            // classification" bug the mint fix exists to close, just one loop iteration later.
            const shouldAutoApprove = !gov.isHighConsequence(currentStage)
              && await this._canAutoAdvance(currentStage);
            if (shouldAutoApprove) {
              this._logger.log(
                `[Worker] Stage ${currentStage} pending decision ${pendingDecision.id} — auto-approving (global_auto_proceed=true)`
              );
              // SD-LEO-INFRA-CHAIRMAN-DECISION-RESOLVE-CANONICAL-001: resolve via the canonical
              // path (fn_chairman_decide) so dashboard/worker/coordinator all write the identical
              // (status, decision, blocking) triple. p_force_stale=true — fresh same-pass
              // autonomous resolve (never stale), so the guard does not false-block it.
              const { error: _approveErr } = await this._supabase.rpc('fn_chairman_decide', {
                p_decision_id: pendingDecision.id,
                p_action: 'approved',
                p_decided_by: 'auto-proceed-worker',
                p_rationale: 'Auto-approved (global_auto_proceed=true)',
                p_force_stale: true,
              });
              if (_approveErr) {
                // SD-LEO-FIX-RETRO-ACTION-ITEMS-001 (FR-3): previously this only logged and still
                // advanced the stage as though approved -- a code/DB state divergence when the RPC
                // (e.g. reject_s16_programmatic_approval) rejected it. Do NOT advance; fall through
                // to the same still-pending handling used when shouldAutoApprove is false, so the
                // decision is retried on the next poll instead of the worker believing it advanced.
                this._logger.warn(`[Worker] Stage ${currentStage} canonical auto-approve failed — NOT advancing (will retry as pending): ${_approveErr.message}`);
              } else {
              // Enrich existing artifact with promotion_gate if missing (build-loop stages).
              // The pending-decision shortcut skips processStage(), so promotion_gate
              // may not have been computed. evaluatePromotionGate is pure/algorithmic.
              // RCA: PAT-ORCH-STATE-001 (pending-decision shortcut artifact gap)
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
                    this._logger.log(`[Worker] Pending auto-approve: enriched S${currentStage} artifact with promotion_gate (pass=${gate.pass})`);
                  }
                } catch (pgErr) {
                  this._logger.warn(`[Worker] promotion_gate enrichment failed (non-fatal): ${pgErr.message}`);
                }
              }

              const nextStage = currentStage + 1;
              const advanceResult = await this._advanceStage(ventureId, currentStage, nextStage, { advancementType: 'auto_approved' });
              if (advanceResult?.blocked) {
                this._logger.log(`[Worker] Stage ${currentStage} advance blocked by artifact gate: ${advanceResult.reason}`);
                releaseState = ORCHESTRATOR_STATES.BLOCKED;
                lastResult = { ventureId, stageId: currentStage, status: 'artifact_precondition_unmet', ...advanceResult };
                break;
              }
              currentStage = nextStage;
              continue;
              }
            }

            // SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-B-A: Backfill advisory_data
            // when pending-decision shortcut fires. Without this, chairman sees empty brief
            // if the first poll cycle's _syncStageWork was missed (restart, error, migration).
            try {
              const { data: stageWork } = await this._supabase.from('venture_stage_work')
                .select('advisory_data')
                .eq('venture_id', ventureId).eq('lifecycle_stage', currentStage)
                .maybeSingle();
              if (!stageWork?.advisory_data || Object.keys(stageWork.advisory_data).length === 0) {
                const { data: existingArt } = await this._supabase.from('venture_artifacts')
                  .select('artifact_data')
                  .eq('venture_id', ventureId).eq('lifecycle_stage', currentStage).eq('is_current', true)
                  .maybeSingle();
                if (existingArt?.artifact_data) {
                  await this._syncStageWork(ventureId, currentStage, {
                    artifacts: [{ payload: existingArt.artifact_data }],
                    status: 'BLOCKED',
                  });
                  this._logger.log(`[Worker] Backfilled advisory_data for S${currentStage} from existing artifact`);
                }
              }
            } catch (backfillErr) {
              this._logger.warn(`[Worker] advisory_data backfill failed (non-fatal): ${backfillErr.message}`);
            }

            this._logger.log(
              `[Worker] Stage ${currentStage} has pending decision ${pendingDecision.id} — remaining blocked`
            );
            releaseState = ORCHESTRATOR_STATES.BLOCKED;
            lastResult = {
              ventureId,
              stageId: currentStage,
              status: 'blocked',
              gate: gov.isReview(currentStage) ? 'review' : 'chairman',
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
                const advanceResult = await this._advanceStage(ventureId, currentStage, nextStage, { advancementType: 'pre_exec_skip_trigger' });
                if (advanceResult?.blocked) {
                  this._logger.log(`[Worker] Stage ${currentStage} advance blocked by artifact gate: ${advanceResult.reason}`);
                  releaseState = ORCHESTRATOR_STATES.BLOCKED;
                  lastResult = { ventureId, stageId: currentStage, status: 'artifact_precondition_unmet', ...advanceResult };
                  break;
                }
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

              // SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-B-A: Sync advisory_data on approved gate re-entry.
              // Previously, the early-exit path skipped _syncStageWork entirely, leaving
              // venture_stage_work.advisory_data empty for gates that had existing artifacts.
              // This ensures S20-S22 produce real data even when gates block then get approved.
              const enableGateSkipFix = process.env.GATE_SKIP_FIX_ENABLED !== 'false';
              if (enableGateSkipFix) {
                try {
                  // Re-read existing stage result from artifacts to populate advisory_data
                  const { data: stageArtifacts } = await this._supabase
                    .from('venture_artifacts')
                    .select('artifact_type, content')
                    .eq('venture_id', ventureId)
                    .eq('lifecycle_stage', currentStage)
                    .eq('is_current', true);

                  if (stageArtifacts && stageArtifacts.length > 0) {
                    const syntheticResult = {
                      status: 'COMPLETED',
                      _gateApproved: true,
                      artifacts: stageArtifacts.map(a => ({
                        payload: typeof a.content === 'object' ? a.content : {}
                      }))
                    };
                    await this._syncStageWork(ventureId, currentStage, syntheticResult);
                    this._logger.log(
                      `[Worker] Stage ${currentStage} advisory_data synced from ${stageArtifacts.length} artifact(s) (gate-skip fix)`
                    );
                  }
                } catch (syncErr) {
                  this._logger.warn(`[Worker] Gate-skip advisory_data sync failed (non-fatal): ${syncErr.message}`);
                }
              }

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
              const advanceResult = await this._advanceStage(ventureId, currentStage, nextStage, { advancementType: 'pre_exec_skip' });
              if (advanceResult?.blocked) {
                this._logger.log(`[Worker] Stage ${currentStage} advance blocked by artifact gate: ${advanceResult.reason}`);
                releaseState = ORCHESTRATOR_STATES.BLOCKED;
                lastResult = { ventureId, stageId: currentStage, status: 'artifact_precondition_unmet', ...advanceResult };
                break;
              }
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

        // SD-FIX-STAGE-TIMING-ZEROS-ORCH-001-A: Attach actual start time to result
        // so _syncStageWork records started_at from stage entry, not completion.
        if (result && !result.startedAt) {
          result.startedAt = new Date(stageStartMs).toISOString();
        }

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
        const govPost = await getStageGovernance(this._supabase);
        if (govPost.isReview(currentStage) || govPost.isBlocking(currentStage)) {
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
            const advanceResult = await this._advanceStage(ventureId, currentStage, nextReentryStage, { durationMs: stageDurationMs, result, advancementType: 're_entry' });
            if (advanceResult?.blocked) {
              this._logger.log(`[Worker] Stage ${currentStage} advance blocked by artifact gate: ${advanceResult.reason}`);
              releaseState = ORCHESTRATOR_STATES.BLOCKED;
              lastResult = { ventureId, stageId: currentStage, status: 'artifact_precondition_unmet', ...advanceResult };
              break;
            }
            currentStage = nextReentryStage;
            continue;
          }
        }

        // Review-mode stages: default-pause for chairman review.
        // SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 (supersedes SD-LEO-FIX-EVA-STAGE-WORKER-001):
        // review_mode is now overrideable via stage_overrides[stage_n].auto_proceed=true.
        // The check below honors _canAutoAdvance which encodes the unified governance:
        //   master toggle + kill/promotion (never overrideable) + explicit override + review-mode default-pause.
        // If user has opted-in for this review stage, we skip the pending-decision creation
        // and let the worker advance naturally on the next loop iteration.
        // (S7 Revenue Arch, S8 BMC, S9 Exit Strategy, S11 Naming/Visual remain default-pause.)
        //
        // SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 (FR-3 completion, adversarial-review fix PR #6104):
        // a chairman-designated high-consequence stage must ALSO pause here even when
        // review_mode isn't 'review' -- this classification is deliberately gate_type/review_mode
        // INDEPENDENT (e.g. a gate_type='none' stage like a first live-money/launch stage that has
        // no gate today). It must ALSO bypass _canAutoAdvance entirely: the whole point of marking a
        // stage high-consequence is that autonomy can never auto-approve it away (unlike a plain
        // review-mode stage, where _canAutoAdvance=true is a legitimate opt-in to skip the pause).
        // isHcStage is evaluated first and short-circuits `_canAutoAdvance` via ||, so a pure
        // high-consequence stage (not review_mode='review') never pays that extra governance call.
        // Kill/promotion stages are excluded here (isBlocking guard, unchanged) -- an isHc
        // kill/promotion stage is handled by _handleChairmanGate below instead, which has its own
        // matching autonomy-bypass for isHc (same PR).
        const isHcStage = govPost.isHighConsequence(currentStage);
        if ((isHcStage || (govPost.isReview(currentStage) && !(await this._canAutoAdvance(currentStage)))) && !govPost.isBlocking(currentStage)) {

          this._logger.log(`[Worker] ${isHcStage ? 'High-consequence' : 'Review-mode'} stage ${currentStage} — blocking for chairman review`);

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

            const { id: decisionId, isNew, reason: skipReason } = await createOrReusePendingDecision({
              ventureId,
              stageNumber: currentStage,
              briefData: { stage: currentStage, ventureName: ventureForReview?.name },
              summary: `Review: Stage ${currentStage} complete for ${ventureForReview?.name || ventureId}`,
              decisionType: 'review',
              // SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 (FR-2/FR-3): chairman-designated
              // high-consequence stages mint a blocking=true decision, forced past the
              // stage_creates_decision self-skip so a gate_type='none'/review_mode!='review'
              // stage (which would otherwise never mint anything) still gets one.
              blocking: isHcStage,
              forceDecisionCreation: isHcStage,
              supabase: this._supabase,
              logger: this._logger,
            });
            // QF-20260703-236: a fixture venture never gets a real decisionId (skipped:true,
            // id:null) — treat exactly like the pre-existing insert-failure path below
            // (reviewInsertOk stays false) so the worker advances instead of blocking on
            // a chairman_decisions row that will never exist to be approved.
            // Scoped to reason==='fixture_venture' specifically (not bare `skipped`) — a
            // DIFFERENT pre-existing skip (isDecisionCreatingStage saying a hard-gate stage
            // isn't actually a decision-creating stage per venture_stages) also returns
            // skipped:true with no reason, and must keep falling through to the unchanged
            // pre-existing logic below rather than being silently treated as fixture-safe.
            if (skipReason === 'fixture_venture') {
              this._logger.log(`[Worker] Review decision skipped for fixture venture ${ventureId} — advancing without chairman gate`);
            } else {
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
            }
          } catch (err) {
            this._logger.error(`[Worker] Review decision creation failed: ${err.message}`);
            // SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 (2nd-pass adversarial-review fix, PR #6104):
            // for a plain review-mode stage, falling through here (reviewInsertOk stays false) is
            // the existing, correct fail-open behavior -- a transient mint error must not strand a
            // routine venture forever with no UI path to unblock. For a HIGH-CONSEQUENCE stage that
            // contract is inverted: this backstop's whole purpose is that chairman authority can
            // never be silently bypassed, so a mint failure here must HOLD, not silently let the
            // venture fall through to a later auto-advance path (e.g. the governance-override
            // check further down this loop) with no chairman decision ever having been recorded.
            if (isHcStage) reviewInsertOk = true;
          }

          // Only block the orchestrator if the decision row was successfully created
          // AND the decision is not already approved.
          // If the insert failed, the venture would be permanently stuck with no
          // UI path to unblock. Instead, log the error and continue processing.
          // (For isHcStage, reviewInsertOk is forced true on a mint error above -- see comment there.)
          if (reviewInsertOk) {
            this._logStageTransition(ventureId, currentStage, 'completed', stageDurationMs, result).catch(() => {});
            await this._writeHealthScore(ventureId, currentStage); // QF: ensure health_score on review-blocked exit
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
        const isHardcodedGate = govPost.isBlocking(currentStage);
        const isDynamicHardGate = !isHardcodedGate && await this._isInHardGateStages(currentStage);

        // Compute failure state BEFORE opening any chairman gate. A FAILED (or
        // missing) stage result must NOT open a hard-gate chairman decision: doing
        // so creates a pending "awaiting decision" gate with no artifact/advisory
        // behind it, so the venture parks at a content-less gate and the stage
        // panel spins "Loading…" forever (RCA: Canvas AI S19, 2026-05-23). A failed
        // stage instead surfaces via the FAILED handler below (orchestrator_state
        // ='failed' — a clean terminal state). The build-loop governance-override
        // path (canGovernanceOverrideFailed) keeps its existing gate handling so
        // auto-advance behaviour is byte-identical. _canAutoAdvance is only called
        // for FAILED build-loop stages (&&-short-circuit) — no extra RPC on success.
        const resultStatus = (result?.status || '').toUpperCase();
        const stageFailed = !result || resultStatus === 'FAILED';
        const canGovernanceOverrideFailed = resultStatus === 'FAILED'
          && currentStage >= 17 && currentStage <= 22
          && await this._canAutoAdvance(currentStage);

        // SD-LEO-INFRA-RESERVED-GATE-BYPASS-001 (FR-1b): a stage that MINTS a chairman decision
        // (stage_creates_decision — e.g. S18 promotion/artifact_only) must open the chairman gate
        // too, not only hardcoded/dynamic hard gates. Without this, S18 ran its producer, isHardGate
        // was false, and the venture advanced UNREVIEWED. Fail-safe toward gating: isDecisionCreatingStage
        // falls back to FALLBACK_DECISION_CREATING_STAGES (S18 included) on RPC error.
        const isDecisionGate = (await isDecisionCreatingStage(currentStage, this._supabase, { logger: this._logger })).creates_decision;
        if (shouldOpenChairmanGate({ isHardGate: isHardcodedGate || isDynamicHardGate, stageFailed, canGovernanceOverrideFailed, isDecisionGate })) {
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
            await this._writeHealthScore(ventureId, currentStage); // QF: ensure health_score on chairman-gate-blocked exit
            releaseState = ORCHESTRATOR_STATES.BLOCKED;
            lastResult = { ventureId, stageId: currentStage, status: 'blocked', gate: 'chairman' };
            break;
          }
          if (gateResult.killed) {
            this._logger.log(`[Worker] Killed at chairman gate stage ${currentStage}`);
            await this._writeHealthScore(ventureId, currentStage); // QF: ensure health_score on killed exit
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

        // resultStatus / stageFailed / canGovernanceOverrideFailed were computed
        // above (before the gate block) so a FAILED stage never opens a gate.
        if (stageFailed) {
          // For build-loop stages with auto-approve, treat FAILED as BLOCKED so
          // governance can override. Analysis steps throw REFUSED for LLM-disabled
          // stages, which becomes FAILED — but governance should still advance.
          // RCA: PAT-ORCH-STATE-001 (FAILED vs BLOCKED in build-loop)
          if (!canGovernanceOverrideFailed) {
            this._logger.error(`[Worker] Stage ${currentStage} failed for ${ventureId} after retries`);
            this._logStageTransition(ventureId, currentStage, 'failed', stageDurationMs, result).catch(() => {});
            await this._writeHealthScore(ventureId, currentStage); // QF: ensure health_score on failed exit
            releaseState = ORCHESTRATOR_STATES.FAILED;
            break;
          }
          this._logger.log(`[Worker] Stage ${currentStage} FAILED but governance can override (build-loop auto-approve)`);
          // Fall through to BLOCKED handler which has governance override logic
        }

        if (resultStatus === 'BLOCKED' || resultStatus === 'FAILED') {
          // Check governance config: if auto-proceed is enabled and this stage
          // is NOT a hard gate, override the BLOCKED status and advance.
          // This handles both: (1) blocking stages (kill/promotion via stage-governance) that were
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
            const advanceResult = await this._advanceStage(ventureId, currentStage, nextOverrideStage, { durationMs: stageDurationMs, result, advancementType: 'governance_override' });
            if (advanceResult?.blocked) {
              this._logger.log(`[Worker] Stage ${currentStage} advance blocked by artifact gate: ${advanceResult.reason}`);
              releaseState = ORCHESTRATOR_STATES.BLOCKED;
              lastResult = { ventureId, stageId: currentStage, status: 'artifact_precondition_unmet', ...advanceResult };
              break;
            }
            currentStage = nextOverrideStage;
            continue;
          } else {
            this._logger.log(`[Worker] Stage ${currentStage} blocked for ${ventureId}`);
            this._logStageTransition(ventureId, currentStage, 'blocked', stageDurationMs, result).catch(() => {});
            await this._writeHealthScore(ventureId, currentStage); // QF: ensure health_score on governance-blocked exit
            releaseState = ORCHESTRATOR_STATES.BLOCKED;
            break;
          }
        }

        // SD-LEO-INFRA-KILLGATE-ROUTE-TO-REVIEW-HOLD-001: a HELD (route-to-review) stage awaits a
        // chairman decision. Unlike BLOCKED, it must NOT governance-auto-advance, and it must NOT
        // fall through to the "completed" path below — stop here and hold (blocked) for review.
        if (resultStatus === 'HELD') {
          this._logger.log(`[Worker] Stage ${currentStage} HELD (route-to-review) for ${ventureId} — awaiting chairman decision`);
          this._logStageTransition(ventureId, currentStage, 'blocked', stageDurationMs, result).catch(() => {});
          await this._writeHealthScore(ventureId, currentStage); // ensure health_score on HELD exit
          releaseState = ORCHESTRATOR_STATES.BLOCKED;
          break;
        }

        // Log successful stage transition
        this._logStageTransition(ventureId, currentStage, 'completed', stageDurationMs, result).catch(() => {});

        // Check filter decision
        if (result.filterDecision?.action === 'STOP') {
          this._logger.log(`[Worker] Filter STOP at stage ${currentStage}`);
          await this._writeHealthScore(ventureId, currentStage); // QF: ensure health_score on filter STOP
          releaseState = ORCHESTRATOR_STATES.BLOCKED;
          break;
        }

        // QF-20260601-055: at S19 the stage-specific leo_bridge bridge gate (below) is the
        // authoritative gate (vision-ready → generate orchestrator+children, else block), and the
        // venture still HOLDS at S19 via that gate + the advance_venture_stage exit-gate-enforcer
        // (build_mvp_build) + the ENFORCE-S19-COMPLETION-001 FR-1 hard gate. A generic ADVISORY
        // REQUIRE_REVIEW (e.g. budget_exceeded MEDIUM after QF-20260601-345) must NOT preempt the
        // deterministic, zero-cost build generation — it would block the bridge without advancing.
        // Skip the generic review pause at S19 and let the S19 gate decide. NO BYPASS: the bridge
        // GENERATES the SDs but never ADVANCES past S19 here (STOP/HIGH still blocks above).
        if (result.filterDecision?.action === 'REQUIRE_REVIEW' && !this._waitForReview && currentStage !== 19) {
          this._logger.log(`[Worker] Review required at stage ${currentStage}, pausing`);
          await this._writeHealthScore(ventureId, currentStage); // QF: ensure health_score on filter REQUIRE_REVIEW
          releaseState = ORCHESTRATOR_STATES.BLOCKED;
          break;
        }

        // SD-LEO-INFRA-STAGE-VISION-ARTIFACT-001 (FR-2): vision-DRIFT gate — INPUT-side, fires BEFORE
        // the leo_bridge bridge generates the SD tree (the vision-acceptance gate further below is the
        // OUTPUT-side post-build complement). Consult the session-hosted vision_drift_verdict recorded
        // in advisory_data and HOLD when the approved L2 vision has materially DRIFTED from the S13-S18
        // artifacts + S19 sprint. Read-only break-HOLD: reaches ZERO _advanceStage call sites.
        // Observe-first: default fail-OPEN on an absent verdict (the session-only producer never runs on
        // the headless worker path — NOT_EVALUATED holds only under VISION_DRIFT_STRICT); flag OFF
        // (default) skips the block entirely (byte-identical legacy advance). Material drift routes to
        // chairman-reconcile; a transient (board-unavailable / packet-incomplete) routes to an alert.
        if (currentStage === 19 && isVisionDriftGateEnabled()) {
          const { hold: driftHold, cause: driftCause, verdict: driftVerdict } = await this._evaluateVisionDriftHold(ventureId);
          if (driftHold) {
            this._logger.error(`[Worker] S19 gate (vision-drift): HOLD — venture ${ventureId} cause=${driftCause} (material_drift=${driftVerdict?.material_drift ?? 'none'}, strict=${isVisionDriftStrict()}).`);
            await this._emitS19HardGateEvent(
              ventureId,
              driftCause === DRIFT_HOLD_CAUSE.TRANSIENT ? 'S19_VISION_DRIFT_TRANSIENT_ALERT' : 'S19_VISION_DRIFT_HOLD',
              {
                cause: driftCause,
                material_drift: driftVerdict?.material_drift ?? null,
                strict: isVisionDriftStrict(),
                reason: driftCause === DRIFT_HOLD_CAUSE.CHAIRMAN ? 'vision_drift_reconcile'
                  : driftCause === DRIFT_HOLD_CAUSE.TRANSIENT ? 'vision_drift_transient'
                  : 'vision_drift_unevaluated',
                decided_by: 's19_vision_drift_gate',
              },
            );
            releaseState = ORCHESTRATOR_STATES.BLOCKED;
            lastResult = { ventureId, stageId: currentStage, status: 'blocked', gate: 'vision_drift_pending' };
            break;
          }
        }

        // S19 build-readiness gate: block at S19 when build_method is replit_agent until the
        // GitHub repo is seeded and a deployment is registered — giving the chairman time to
        // create & seed the repo and build it with Claude Code before the worker auto-advances to S20.
        if (currentStage === 19) {
          const { data: s19Work } = await this._supabase
            .from('venture_stage_work')
            .select('advisory_data')
            .eq('venture_id', ventureId)
            .eq('lifecycle_stage', 19)
            .maybeSingle();
          // SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 (RCA 813d4c3d): resolve the build model via the
          // SINGLE arbiter (ventures.build_model SSOT, legacy build_method fallback) instead of this
          // gate independently defaulting to 'replit_agent' — the schism that let the seeded path win.
          const { data: ventureBM } = await this._supabase
            .from('ventures').select('build_model').eq('id', ventureId).maybeSingle();
          const { resolveBuildModel } = await import('./bridge/resolve-build-model.js');
          const buildModel = resolveBuildModel({
            ventureBuildModel: ventureBM?.build_model,
            legacyBuildMethod: s19Work?.advisory_data?.build_method,
          });
          if (buildModel === 'seeded_repo') {
            // Seeded path: block at S19 until the chairman has seeded the repo + a deployment is registered.
            const repoUrl = s19Work?.advisory_data?.replit_repo_url;
            if (!repoUrl) {
              this._logger.log('[Worker] S19 gate: blocking — build_model=seeded_repo but no repo URL set. Chairman needs to create & seed repo first.');
              releaseState = ORCHESTRATOR_STATES.BLOCKED;
              lastResult = { ventureId, stageId: currentStage, status: 'blocked', gate: 'replit_setup_pending' };
              break;
            }
            this._logger.log(`[Worker] S19 gate (seeded_repo): repo URL set (${repoUrl}) — proceeding`);
          } else {
            // SD-LEO-INFRA-RELIABLE-S19-BUILD-001 / FR-2: HARD CUTOVER fail-loud gate.
            // Synchronously run the LEO-SD bridge and BLOCK advancement on a real failure
            // (e.g. VENTURE_L2_VISION_MISSING) instead of letting the fire-and-forget hook
            // swallow it and the venture silently advance past S19 un-built.
            const advisory = s19Work?.advisory_data || {};

            // SD-LEO-INFRA-S19-CLONE-VISION-PROMOTE-ORDER-001 (FR-1): the clone-vision auto-promote
            // formerly invoked here now runs at the TOP of _runS19Bridge (the shared callee) so ALL
            // bridge entry points promote first, not just this sync-gate path. Removed to avoid a
            // redundant double-invocation (it is idempotent regardless).

            // Chairman override escape hatch: an operator can force advancement past S19.
            if (advisory.chairman_override === true) {
              this._logger.log('[Worker] S19 gate (leo_bridge): chairman_override=true — proceeding past S19 without a bridge-built SD set.');
            } else if (
              // Cheap fast-path: a prior run already blocked on a pending vision AND no
              // approved L2 vision exists yet → re-block without re-running the slow bridge.
              advisory.bridge_failed === true &&
              advisory.reason === 'vision_pending'
            ) {
              const { data: approvedVision } = await this._supabase
                .from('eva_vision_documents')
                .select('vision_key')
                .eq('venture_id', ventureId)
                .eq('level', 'L2')
                .eq('status', 'active')
                .eq('chairman_approved', true)
                .limit(1)
                .maybeSingle();
              if (!approvedVision) {
                this._logger.error(`[Worker] S19 gate (leo_bridge): re-blocking — prior vision_pending block stands, still no chairman-approved L2 vision for venture ${ventureId}.`);
                releaseState = ORCHESTRATOR_STATES.BLOCKED;
                lastResult = { ventureId, stageId: currentStage, status: 'blocked', gate: 'leo_bridge_vision_pending' };
                break;
              }
              // Approved vision now exists — fall through to (re)run the bridge below.
              // SD-LEO-INFRA-HARDEN-S19-S20-001 (FR-1): decide via the single shared
              // classifier+decision instead of re-deriving idempotency inline (schism root cause).
              const bridge = await this._runS19Bridge(ventureId);
              const buildComplete = await this._isLeoBridgeBuildComplete(ventureId);
              if (shouldHoldAtS19(bridge.outcome, buildComplete)) {
                this._logger.error(`[Worker] S19 gate (leo_bridge): HOLD after vision approval for venture ${ventureId} (outcome=${bridge.outcome}, buildComplete=${buildComplete}). Errors: ${JSON.stringify(bridge.errors || [])}`);
                await this._blockS19LeoBridge(ventureId, bridge.errors || []);
                await this._emitS19HardGateEvent(ventureId, 'S19_HARD_GATE_BLOCK', {
                  build_complete: buildComplete, bridge_outcome: bridge.outcome,
                  reason: 'leo_bridge_vision_pending', decided_by: 's19_entry_gate_fastpath',
                });
                releaseState = ORCHESTRATOR_STATES.BLOCKED;
                lastResult = { ventureId, stageId: currentStage, status: 'blocked', gate: 'leo_bridge_vision_pending' };
                break;
              }
              this._logger.log(`[Worker] S19 gate (leo_bridge): proceeding after vision approval (outcome=${bridge.outcome}).`);
            } else {
              // Primary path. SD-LEO-INFRA-HARDEN-S19-S20-001 (FR-1): the bridge OUTCOME enum +
              // the single shared shouldHoldAtS19 decision replace the inline idempotency
              // re-derivation. The old `!created && errors.length===0` rule mis-read a
              // ZERO_SDS_FAILURE (payloads>0, 0 SDs, empty errors) as idempotent → advanced an
              // unbuilt venture (RCA 7610876f). Now: HOLD on every incomplete state except the
              // NOOP_EMPTY 0-payload case; proceed when the build is complete / chairman_override.
              const bridge = await this._runS19Bridge(ventureId);
              const buildComplete = await this._isLeoBridgeBuildComplete(ventureId);
              if (shouldHoldAtS19(bridge.outcome, buildComplete)) {
                this._logger.error(`[Worker] S19 gate (leo_bridge): HOLD — outcome=${bridge.outcome}, buildComplete=${buildComplete} for venture ${ventureId}. Errors: ${JSON.stringify(bridge.errors || [])}`);
                await this._blockS19LeoBridge(ventureId, bridge.errors || []);
                await this._emitS19HardGateEvent(ventureId, 'S19_HARD_GATE_BLOCK', {
                  build_complete: buildComplete, bridge_outcome: bridge.outcome,
                  reason: 'leo_bridge_vision_pending', decided_by: 's19_entry_gate_primary',
                });
                releaseState = ORCHESTRATOR_STATES.BLOCKED;
                lastResult = { ventureId, stageId: currentStage, status: 'blocked', gate: 'leo_bridge_vision_pending' };
                break;
              }
              this._logger.log(`[Worker] S19 gate (leo_bridge): proceeding (outcome=${bridge.outcome}, orchestrator=${bridge.orchestratorKey}, children=${bridge.childKeys?.length || 0}).`);
            }
            // SD-LEO-FEAT-SURFACE-S19-VISION-001 (FR-2): every block path above `break`s out of the
            // venture loop, so reaching here means the vision gate is PROCEEDING (approved /
            // idempotent / chairman_override). Resolve any pending vision_approval decision so it
            // clears the chairman Decision Deck once the venture advances past S19.
            await this._resolveVisionPendingDecision(ventureId);
          }
        }

        // SD-LEO-INFRA-VISION-GROUNDED-ACCEPTANCE-001 (FR-2): vision-grounded acceptance gate.
        // The S19 build-readiness gate above has PROCEEDED (so the venture is past the vision_pending
        // and build-incomplete holds). Consult the session-hosted vision-acceptance verdict recorded
        // in advisory_data and HOLD (fail CLOSED) when the built venture has verified GAPS vs the
        // chairman-approved vision. This is a break-HOLD only — it reaches ZERO _advanceStage call
        // sites and adds no advance path. Default fail-open on an unrecorded verdict (strict=OFF) for a
        // zero-regression rollout; flag OFF skips the block entirely (byte-identical legacy advance).
        if (currentStage === 19 && isVisionAcceptanceGateEnabled()) {
          const { hold: visionHold, verdict: visionVerdict } = await this._evaluateVisionAcceptanceHold(ventureId);
          if (visionHold) {
            this._logger.error(`[Worker] S19 gate (vision-acceptance): HOLD — built venture ${ventureId} failed vision acceptance (verdict.pass=${visionVerdict?.pass ?? 'none'}, strict=${isVisionAcceptanceStrict()}, gaps=${Array.isArray(visionVerdict?.gaps) ? visionVerdict.gaps.length : 0}).`);
            await this._emitS19HardGateEvent(ventureId, 'S19_VISION_ACCEPTANCE_HOLD', {
              verdict_pass: visionVerdict?.pass ?? null,
              gaps: Array.isArray(visionVerdict?.gaps) ? visionVerdict.gaps.length : null,
              strict: isVisionAcceptanceStrict(),
              reason: 'vision_acceptance_pending', decided_by: 's19_vision_acceptance_gate',
            });
            releaseState = ORCHESTRATOR_STATES.BLOCKED;
            lastResult = { ventureId, stageId: currentStage, status: 'blocked', gate: 'vision_acceptance_pending' };
            break;
          }
        }

        // SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-D (FR-6): S19 deploy-target provisioning
        // check (design §5 — provisioning executes at S19 entry beside the spend/stack gates;
        // production deploy is an S19 exit requirement). PLACEMENT IS LOAD-BEARING: this runs
        // AFTER the bridge/provisioning blocks above (_runS19Bridge → _verifyAndProvisionVenture
        // is the only writer of stack_descriptor.connection) — checking before them would be the
        // block-before-remediate deadlock class the scaffold gate's comment documents (an
        // enforce-blocked venture whose only fix runs later in the same tick, adversarial
        // review of PR #5769). OBSERVE-ONLY by default per the protocol default:
        // S19_DEPLOY_PROVISIONING=observe logs the would-block; 'enforce' (post-calibration
        // promotion) blocks like the sibling scaffold gate, with the same durable
        // venture_stage_work record so chairman surfaces show WHY the venture is held.
        if (currentStage === 19) {
          try {
            const { checkDeployTargetProvisioned } = await import('../venture-deploy/provisioning-check.js');
            const prov = await checkDeployTargetProvisioned(this._supabase, ventureId);
            if (!prov.provisioned) {
              const rawGateMode = process.env.S19_DEPLOY_PROVISIONING;
              const gateMode = (rawGateMode || 'observe').trim().toLowerCase();
              if (rawGateMode && gateMode !== 'enforce' && gateMode !== 'observe') {
                // Misconfigured promotion is the highest-stakes moment for this footgun:
                // never let a typo'd 'enforce' silently observe without saying so.
                this._logger.warn(`[Worker] S19_DEPLOY_PROVISIONING has unrecognized value '${rawGateMode}' — treating as observe.`);
              }
              if (gateMode === 'enforce') {
                this._logger.error(`[Worker] S19 DEPLOY-PROVISIONING gate: venture ${ventureId} — ${prov.reason} — blocking S19 advance.`);
                // Merge, not replace — sibling gates write chairman-facing data into this row.
                const { data: existingRow } = await this._supabase
                  .from('venture_stage_work')
                  .select('advisory_data')
                  .eq('venture_id', ventureId).eq('lifecycle_stage', 19).maybeSingle();
                await this._supabase.from('venture_stage_work').upsert({
                  venture_id: ventureId,
                  lifecycle_stage: 19,
                  stage_status: 'blocked',
                  work_type: 'sd_required',
                  advisory_data: { ...(existingRow?.advisory_data || {}), reason: 'deploy_target_unprovisioned', detail: prov.reason },
                }, { onConflict: 'venture_id,lifecycle_stage' });
                releaseState = ORCHESTRATOR_STATES.BLOCKED;
                lastResult = { ventureId, stageId: 19, status: 'blocked', gate: 'deploy_target_unprovisioned', reason: prov.reason };
                break;
              }
              this._logger.warn(`[Worker] S19 DEPLOY-PROVISIONING (observe-only — would block under enforce): venture ${ventureId} — ${prov.reason}`);
            }
          } catch (e) {
            // The check itself failing is not this gate's enforcement to invent —
            // fail-open with a loud log, same posture as the scaffold gate's catch.
            this._logger.warn(`[Worker] S19 deploy-provisioning check failed (non-fatal, fail-open): ${e.message}`);
          }
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
          await this._writeHealthScore(ventureId, currentStage); // QF: ensure health_score on lifecycle completion
          await markCompleted(this._supabase, ventureId, { lockId, logger: this._logger });
          this._activeVentures.delete(ventureId);
          return lastResult;
        }

        if (result.nextStageId) {
          // Filter engine set nextStageId and already advanced DB — fire hooks for completed stage
          await this._writeHealthScore(ventureId, currentStage); // SD-MAN-FIX-PIPELINE-HEALTH-GAPS-ORCH-001-A: Path A
          this._runPostStageHooks(ventureId, currentStage).catch(e => this._logger.warn(`[Worker] Post-hook S${currentStage} failed: ${e.message}`)); // fire-and-forget
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
            await this._writeHealthScore(ventureId, currentStage); // SD-MAN-FIX-PIPELINE-HEALTH-GAPS-ORCH-001-A: Path B
            this._runPostStageHooks(ventureId, currentStage).catch(e => this._logger.warn(`[Worker] Post-hook S${currentStage} failed: ${e.message}`)); // fire-and-forget
            currentStage = dbStage;
          } else {
            // DB stage didn't advance — explicitly advance to next stage via SAE
            const nextStage = currentStage + 1;
            if (nextStage > MAX_STAGE) {
              this._logger.log(`[Worker] Venture ${ventureId} completed lifecycle at stage ${currentStage}`);
              await this._writeHealthScore(ventureId, currentStage); // QF: ensure health_score on secondary lifecycle completion
              await markCompleted(this._supabase, ventureId, { lockId, logger: this._logger });
              this._activeVentures.delete(ventureId);
              return lastResult;
            }
            const advanceResult = await this._advanceStage(ventureId, currentStage, nextStage, { durationMs: stageDurationMs, result, advancementType: 'normal' });
            if (advanceResult?.blocked) {
              this._logger.log(`[Worker] Stage ${currentStage} advance blocked by artifact gate: ${advanceResult.reason}`);
              releaseState = ORCHESTRATOR_STATES.BLOCKED;
              lastResult = { ventureId, stageId: currentStage, status: 'artifact_precondition_unmet', ...advanceResult };
              break;
            }
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
   *
   * SD: SD-LEO-INFRA-VENTURE-LEO-BUILD-001-G;
   * SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 FR-2.C1 — two corrections:
   *   1. provision with the venture UUID, NOT the name. provisionVenture resolves
   *      its state + metadata BY id (getState/resolveVentureMetadata), so passing
   *      a name silently mis-queried and never provisioned.
   *   2. FAIL LOUD (NC-7): a provisioning failure aborts the leo_bridge SD
   *      creation instead of silently building against a missing repo. The throw
   *      propagates to the stage-processing layer (_processVenture try/catch),
   *      which records it as a stage failure — matching the unwrapped error model
   *      of the surrounding bridge flow (artifact fetch, convertSprintToSDs).
   *
   * @param {string} ventureId - Venture UUID (passed to provisionVenture)
   * @param {string} [ventureName] - Venture name (provisioning-state pre-check + logs only)
   */
  async _verifyAndProvisionVenture(ventureId, ventureName) {
    // Provisioning-state pre-check is a soft optimization. A query error (e.g. the
    // table is absent) is tolerable: fall through to an actual provisioning attempt.
    let provState = null;
    try {
      const { data, error: provError } = await this._supabase
        .from('venture_provisioning_state')
        .select('state, github_repo_url, provisioned_at')
        .eq('venture_name', ventureName)
        .maybeSingle();
      if (provError) {
        this._logger.warn(`[Worker] Provisioning pre-check query error (non-fatal): ${provError.message}`);
      } else {
        provState = data;
      }
    } catch (preErr) {
      this._logger.warn(`[Worker] Provisioning pre-check failed (non-fatal): ${preErr.message}`);
    }

    if (provState?.state === 'provisioned' && provState?.github_repo_url) {
      this._logger.log(`[Worker] Venture "${ventureName}" already provisioned (${provState.github_repo_url})`);
      return;
    }

    this._logger.log(`[Worker] Venture "${ventureName}" not provisioned — auto-provisioning (venture ${ventureId})`);

    const provisionerPath = new URL('./bridge/venture-provisioner.js', import.meta.url);
    const { provisionVenture } = await import(provisionerPath.href);
    if (typeof provisionVenture !== 'function') {
      // The provisioner module ships in the tree now; a missing export is a real
      // regression, not the historical "not yet implemented" case.
      throw new Error('[Worker] venture-provisioner.provisionVenture is not exported — cannot provision before SD bridge');
    }

    // FR-2.C1: pass the venture UUID. `supabase` is intentionally NOT forwarded —
    // provisionVenture owns its own client and silently ignored the arg before.
    // provisionVenture expects `logger` to be a FUNCTION (its default is console.log) and
    // calls it as ctx.log(msg); this._logger is the console OBJECT, so wrap its .log method
    // — passing the object directly crashes with "ctx.log is not a function" (surfaced by the
    // CronGenius leo_bridge E2E, which is the first run to reach provisioning with a real UUID).
    const repoPath = provState?.github_repo_url || null;
    const result = await provisionVenture(ventureId, {
      logger: (m) => this._logger.log(m),
      ventureRepoPath: repoPath,
    });

    if (!result || result.success !== true) {
      const reason = result?.error || 'unknown provisioning failure';
      this._logger.error(`[Worker] Venture provisioning FAILED for "${ventureName}" (${ventureId}): ${reason}`);
      throw new Error(`Venture provisioning failed for ${ventureName} (${ventureId}): ${reason}`);
    }

    this._logger.log(`[Worker] Provisioned venture "${ventureName}" (steps: ${(result.stepsCompleted || []).join(', ') || 'none'})`);
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

        // SUCCESS, BLOCKED, or HELD — don't retry these (STATUS constants are uppercase).
        // SD-LEO-INFRA-KILLGATE-ROUTE-TO-REVIEW-HOLD-001: HELD (route-to-review) is a terminal
        // review state awaiting a chairman decision — it must NOT fall into the FAILED retry path.
        const s = (result.status || '').toUpperCase();
        if (s === 'COMPLETED' || s === 'BLOCKED' || s === 'HELD') {
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
      // SD-LEO-INFRA-VENTURE-DATA-CAPTURE-EMISSION-001-B (SD-0b / FR-1+FR-2): emit-at-source
      // the real-vs-simulated build_kind tag ADDITIVELY into metadata. The derivation is
      // fully fail-soft (fetch returns null on any error, deriveBuildKind returns null when
      // untaggable), and mergeBuildKind omits the key entirely when build_kind is null — so
      // this NEVER changes the insert's success behavior nor clobbers operating_mode.
      const venture = await this._fetchVentureBuildSignals(ventureId);
      const buildKind = deriveBuildKind(venture);
      const metadata = mergeBuildKind({ operating_mode: getOperatingMode(stageNumber) }, buildKind);
      const { data, error } = await this._supabase
        .from('stage_executions')
        .insert({
          venture_id: ventureId,
          lifecycle_stage: stageNumber,
          worker_id: this._workerId,
          status: 'running',
          started_at: now,
          heartbeat_at: now,
          metadata,
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
      const update = {
        status,
        completed_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
        error_message: errorMessage,
      };

      // SD-LEO-INFRA-VENTURE-DATA-CAPTURE-EMISSION-001-B (SD-0b / FR-2): ensure build_kind is
      // present on the FINALIZED row's metadata — ADDITIVELY (spread existing metadata, set the
      // tag, never clobber other keys) and IDEMPOTENTLY (re-finalize re-derives the same value).
      // Fully fail-soft: any read/derive error leaves the finalize update tag-free. NEVER throws.
      try {
        const buildKind = await this._deriveBuildKindForExecution(executionId);
        if (buildKind !== null) {
          const { data: existing } = await this._supabase
            .from('stage_executions')
            .select('metadata')
            .eq('id', executionId)
            .maybeSingle();
          update.metadata = mergeBuildKind(existing?.metadata, buildKind);
        }
      } catch (tagErr) {
        this._logger.warn(`[Worker] build_kind finalize merge skipped (non-fatal): ${tagErr.message}`);
      }

      const { error } = await this._supabase
        .from('stage_executions')
        .update(update)
        .eq('id', executionId);

      if (error) {
        this._logger.warn(`[Worker] stage_executions finalize failed: ${error.message}`);
      }
    } catch (err) {
      this._logger.warn(`[Worker] stage_executions finalize error: ${err.message}`);
    }
  }

  /**
   * SD-LEO-INFRA-VENTURE-DATA-CAPTURE-EMISSION-001-B (SD-0b / FR-1): fetch the venture's
   * real-build signal columns for one stage execution. FAIL-SOFT: returns null on any error
   * or missing row so the caller emits an untagged (never a throwing) build_kind.
   *
   * @param {string} ventureId
   * @returns {Promise<{deployment_url:string|null, repo_url:string|null, workflow_started_at:string|null, launch_mode:string|null}|null>}
   */
  async _fetchVentureBuildSignals(ventureId) {
    try {
      if (!ventureId) return null;
      const { data, error } = await this._supabase
        .from('ventures')
        .select('deployment_url, repo_url, workflow_started_at, launch_mode')
        .eq('id', ventureId)
        .maybeSingle();
      if (error) {
        this._logger.warn(`[Worker] build_kind venture fetch failed (non-fatal): ${error.message}`);
        return null;
      }
      return data ?? null;
    } catch (err) {
      this._logger.warn(`[Worker] build_kind venture fetch error (non-fatal): ${err.message}`);
      return null;
    }
  }

  /**
   * SD-LEO-INFRA-VENTURE-DATA-CAPTURE-EMISSION-001-B (SD-0b): resolve build_kind for an
   * EXISTING stage_executions row (finalize path has only the executionId — look up its
   * venture_id, then derive). FAIL-SOFT: returns null on any error / missing row.
   *
   * @param {string} executionId
   * @returns {Promise<'real'|'simulated'|null>}
   */
  async _deriveBuildKindForExecution(executionId) {
    try {
      const { data: row, error } = await this._supabase
        .from('stage_executions')
        .select('venture_id')
        .eq('id', executionId)
        .maybeSingle();
      if (error || !row?.venture_id) return null;
      const venture = await this._fetchVentureBuildSignals(row.venture_id);
      return deriveBuildKind(venture);
    } catch {
      return null;
    }
  }

  /**
   * Get the effective stale-lock threshold for a given stage.
   * Checks lifecycle_stage_config.metadata.stage_timeout_ms for per-stage overrides.
   * SD-MAN-FIX-S15-DESIGN-STUDIO-001: Per-stage timeout support
   *
   * @param {number} stageNumber - Stage number
   * @returns {Promise<number>} Threshold in ms
   */
  async _getStageTimeoutMs(stageNumber) {
    try {
      const { data: cfg } = await this._supabase
        .from('venture_stages') /* SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-B: unified superset */
        .select('metadata')
        .eq('stage_number', stageNumber)
        .single();
      if (cfg?.metadata?.stage_timeout_ms) {
        return cfg.metadata.stage_timeout_ms;
      }
    } catch { /* use default */ }
    return this._staleLockThresholdMs;
  }

  /**
   * Mark running execution records with stale heartbeats as timed_out.
   * Supplements _releaseStaleLocks by detecting crashed workers at the
   * per-stage granularity rather than per-venture lock level.
   * SD-MAN-FIX-S15-DESIGN-STUDIO-001: Uses per-stage timeout overrides.
   *
   * SD-VW-BACKEND-EXEC-RECORDS-001: FR5 — Stale execution detection
   */
  async _markStaleExecutions() {
    try {
      // Use default threshold for the initial query to find candidates
      const cutoff = new Date(Date.now() - this._staleLockThresholdMs).toISOString();

      // Paginated (FR-6 batch 7): a capped read would silently leave stale executions
      // unmarked. Page errors are handled below, preserving the warn-and-return policy.
      let stale;
      try {
        stale = await fetchAllPaginated(() => this._supabase
          .from('stage_executions')
          .select('id, venture_id, lifecycle_stage, worker_id, heartbeat_at')
          .eq('status', 'running')
          .lt('heartbeat_at', cutoff)
          .order('id', { ascending: true }));
      } catch (e) {
        this._logger.warn(`[Worker] Stale execution query failed: ${e.message}`);
        return;
      }

      if (!stale || stale.length === 0) return;

      for (const exec of stale) {
        const age = Date.now() - new Date(exec.heartbeat_at).getTime();

        // Check per-stage timeout override before marking as stale
        const stageThreshold = await this._getStageTimeoutMs(exec.lifecycle_stage);
        if (age < stageThreshold) continue;

        this._logger.warn(
          `[Worker] Marking stale execution ${exec.id} as timed_out ` +
          `(venture=${exec.venture_id}, stage=${exec.lifecycle_stage}, ` +
          `worker=${exec.worker_id}, heartbeat ${Math.round(age / 1000)}s ago, threshold ${stageThreshold / 1000}s)`
        );

        const { error: updateError } = await this._supabase
          .from('stage_executions')
          .update({
            status: 'timed_out',
            completed_at: new Date().toISOString(),
            error_message: `Stale heartbeat detected (${Math.round(age / 1000)}s since last heartbeat, threshold ${stageThreshold / 1000}s)`,
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
      //   kill_gate   → always manual, never auto-approve
      //   promotion_gate → manual at L0-L1, auto at L2+
      // Gate-type sourced from stage_config via stage-governance.js (single source of truth).
      const govGate = await getStageGovernance(this._supabase);
      const gateType = govGate.isKill(stageNumber) ? 'kill_gate'
        : govGate.isPromotion(stageNumber) ? 'promotion_gate'
        : 'stage_gate'; // fallback for any future gates

      // SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 (FR-3 completion, adversarial-review fix PR #6104):
      // a chairman-designated high-consequence stage must never be auto-approved away by either
      // autonomy shortcut below -- a promotion_gate is otherwise auto-approved at L2+ autonomy
      // (checkAutonomy) and any gate can be forced open via governance overrides (_canAutoAdvance),
      // both of which would silently defeat the whole point of the high-consequence classification.
      // kill_gate is unaffected in practice (checkAutonomy already never auto-approves it), but the
      // guard is unconditional so a future autonomy-model change can't reopen this gap silently.
      const isHcGate = govGate.isHighConsequence(stageNumber);

      if (!isHcGate) {
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
      }

      // Fetch brief data for the decision
      const { data: venture } = await this._supabase
        .from('ventures')
        .select('name, metadata')
        .eq('id', ventureId)
        .single();

      // SD-LEO-INFRA-CHAIRMAN-DECISION-HEALTH-PROVENANCE-001 FR-3: carry the gate's quality breakdown
      // (quality score, completeness %, critical gaps, gate rationale) into brief_data so the chairman
      // 'Blueprint Quality Summary' renders the review basis instead of an empty header. Sourced from
      // the current stage's advisory_data in venture_stage_work. Fail-open — never block the gate.
      let gateQuality = {};
      try {
        const { data: stageWork } = await this._supabase
          .from('venture_stage_work')
          .select('advisory_data')
          .eq('venture_id', ventureId)
          .eq('lifecycle_stage', stageNumber)
          .maybeSingle();
        gateQuality = extractGateQuality(stageWork?.advisory_data);
      } catch (_) { /* non-fatal */ }

      // SD-LEO-INFRA-VENTURE-SELECTION-DEMAND-001 FR-1: the mandatory manual review at a
      // kill_gate stage must surface the underlying computed kill-gate verdict by name --
      // without this, the chairman brief only carried quality_score/completeness_pct/
      // critical_gaps/gate_rationale and a 'kill' verdict was invisible to the reviewer.
      // Scoped to stage 5 (the only stage currently persisting a truth_financial_model
      // verdict artifact); fail-open on lookup error, never blocks the gate.
      let killGateVerdict = {};
      if (gateType === 'kill_gate' && stageNumber === 5) {
        try {
          const { data: artifact } = await this._supabase
            .from('venture_artifacts')
            .select('artifact_data')
            .eq('venture_id', ventureId)
            .eq('lifecycle_stage', stageNumber)
            .eq('artifact_type', 'truth_financial_model')
            .eq('is_current', true)
            .maybeSingle();
          killGateVerdict = extractKillGateVerdict(artifact?.artifact_data);
        } catch (_) { /* non-fatal */ }
      }

      const { id: decisionId, isNew, reason: skipReason } = await createOrReusePendingDecision({
        ventureId,
        stageNumber,
        briefData: { stage: stageNumber, ventureName: venture?.name, ...gateQuality, ...killGateVerdict },
        summary: `Chairman gate: Stage ${stageNumber} review for ${venture?.name || ventureId}`,
        // SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 (FR-2/FR-3): chairman-designated
        // high-consequence stages mint a blocking=true decision, forced past the
        // stage_creates_decision self-skip in case a dynamic hard-gate stage reaches
        // this point without also satisfying that predicate.
        blocking: isHcGate,
        forceDecisionCreation: isHcGate,
        supabase: this._supabase,
        logger: this._logger,
      });

      // QF-20260703-236: a fixture venture never gets a real decisionId (skipped:true,
      // id:null) — a null-id decision could never be approved by a real chairman, so
      // treat it as auto-approved rather than blocking forever or throwing in waitForDecision.
      // Scoped to reason==='fixture_venture' specifically (not bare `skipped`) — a DIFFERENT
      // pre-existing skip (isDecisionCreatingStage disagreeing with this worker's own
      // hard-gate-stage classification) also returns skipped:true with no reason, and must
      // NOT be silently auto-approved; it falls through to the unchanged logic below exactly
      // as it did before this fix (safe-but-stuck, not a governance bypass).
      if (skipReason === 'fixture_venture') {
        this._logger.log(`[Worker] Chairman gate ${stageNumber} skipped for fixture venture ${ventureId} — auto-advancing`);
        return { blocked: false, killed: false, approved: true };
      }

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

      // Paginated (FR-6 batch 7): a capped read would silently leave stale locks held.
      // Page errors are handled below, preserving the warn-and-return policy.
      let stale;
      try {
        stale = await fetchAllPaginated(() => this._supabase
          .from('ventures')
          .select('id, name, orchestrator_lock_acquired_at')
          .eq('orchestrator_state', ORCHESTRATOR_STATES.PROCESSING)
          .lt('orchestrator_lock_acquired_at', cutoff)
          .order('id', { ascending: true }));
      } catch (e) {
        this._logger.warn(`[Worker] Stale lock query failed: ${e.message}`);
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
   * Reset ventures stuck in processing state from previous (dead) worker instances. Called once at
   * startup before the first poll tick.
   *
   * SD-LEO-INFRA-STAGE-WORKER-RELIABILITY-001 (FR-1): recover by LOCK STALENESS, mirroring the proven
   * periodic stale-lock sweep (_releaseStaleLocks). The prior implementation compared the UUID column
   * orchestrator_lock_id (acquireProcessingLock writes randomUUID()) against this._workerId (a
   * `sew-host-pid` STRING) — a uuid-vs-string cast error that the catch swallowed, so recovery silently
   * no-op'd and venture-1 froze twice. Staleness correctly identifies dead-instance locks (heartbeat
   * older than the threshold) WITHOUT a schema migration and without stealing a live worker's fresh lock.
   * NOTE: the staleness logic intentionally parallels _releaseStaleLocks; a future refactor could share
   * a helper (and update the resilience test that asserts the sweep's exact message).
   */
  async _onStartupRecovery() {
    try {
      const cutoff = new Date(Date.now() - this._staleLockThresholdMs).toISOString();
      // Paginated (FR-6 batch 7): a capped read would silently skip orphaned-lock
      // recovery for ventures beyond the cap.
      let orphaned;
      try {
        orphaned = await fetchAllPaginated(() => this._supabase
          .from('ventures')
          .select('id, name, orchestrator_lock_acquired_at')
          .eq('orchestrator_state', ORCHESTRATOR_STATES.PROCESSING)
          .lt('orchestrator_lock_acquired_at', cutoff)
          .order('id', { ascending: true }));
      } catch (pageErr) {
        // FR-2: FAIL-LOUD — a recovery-query error must NOT be silently swallowed (the prior `warn` +
        // return is exactly what masked the uuid-cast bug). Log at ERROR and emit a diagnostic event.
        this._logger.error(`[Worker] Startup recovery query failed (FAIL-LOUD): ${pageErr.message}`);
        await emit(this._supabase, 'startup_recovery_query_failed', {
          error: pageErr.message,
          workerId: this._workerId,
        }, 'stage-execution-worker').catch(() => {});
        return; // non-fatal: worker startup continues, but the failure is now observable
      }

      if (!orphaned || orphaned.length === 0) return;

      let resetCount = 0;
      for (const venture of orphaned) {
        const lockAge = Date.now() - new Date(venture.orchestrator_lock_acquired_at).getTime();
        this._logger.warn(
          `[Worker] Startup recovery: resetting ${venture.name || venture.id} ` +
          `(stale lock locked ${Math.round(lockAge / 1000)}s ago, threshold ${this._staleLockThresholdMs / 1000}s)`
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
          resetCount++;
          await emit(this._supabase, 'startup_recovery_lock_released', {
            ventureId: venture.id,
            ventureName: venture.name,
            lockAge,
            releasedBy: this._workerId,
          }, 'stage-execution-worker').catch(() => {});
        }
      }

      this._logger.log(`[Worker] Startup recovery complete: ${resetCount} venture(s) reset`);
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
      // Paginated (FR-6 batch 7): a capped read would silently leave resolved blocks
      // undetected. Page errors throw into the enclosing catch (prior fail-soft).
      const blocked = await fetchAllPaginated(() => this._supabase
        .from('ventures')
        .select('id, name, current_lifecycle_stage, metadata')
        .eq('status', 'active')
        .eq('orchestrator_state', ORCHESTRATOR_STATES.BLOCKED)
        .order('id', { ascending: true }));

      if (!blocked || blocked.length === 0) return;

      for (const venture of blocked) {
        // SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001-C / FR-3: a frozen venture must
        // stay blocked — never resurface/unblock it even if its previous stage
        // completed externally. This is the durable accidental-resume guard.
        if (isVentureFrozen(venture)) {
          this._logger.log(`[Worker] Keeping frozen venture ${venture.name || venture.id} blocked (dogfood-complete; not unblocked)`);
          continue;
        }

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

          const { count } = await this._supabase
            .from('ventures')
            .update({
              orchestrator_state: ORCHESTRATOR_STATES.IDLE,
              orchestrator_lock_id: null,
              orchestrator_lock_acquired_at: null,
            }, { count: 'exact' })
            .eq('id', venture.id)
            .eq('orchestrator_state', ORCHESTRATOR_STATES.BLOCKED);

          if (count > 0) {
            this._logger.log(
              `[Worker] Unblocked ${venture.name || venture.id}: Stage ${prevStage} completed externally, ` +
              `reset orchestrator_state to idle for Stage ${venture.current_lifecycle_stage}`
            );
          }
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
  /**
   * Compute and write health score for a completed stage.
   * Called from ALL advancement paths (A, B, and C) to ensure coverage.
   * SD-MAN-FIX-PIPELINE-HEALTH-GAPS-ORCH-001-A
   */
  async _writeHealthScore(ventureId, completedStage) {
    try {
      const { computeHealthScore } = await import('./health-score-computer.js');
      const { data: stageWork } = await this._supabase
        .from('venture_stage_work')
        .select('advisory_data')
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', completedStage)
        .maybeSingle();
      const healthScore = computeHealthScore(stageWork?.advisory_data);
      // RCA: Use UPSERT — row may not exist if _syncStageWork was skipped (early-exit paths)
      const now = new Date().toISOString();
      await this._supabase
        .from('venture_stage_work')
        .upsert({
          venture_id: ventureId,
          lifecycle_stage: completedStage,
          health_score: healthScore,
          stage_status: 'completed',
          work_type: 'artifact_only',
          completed_at: now,
          updated_at: now,
        }, { onConflict: 'venture_id,lifecycle_stage' });
      this._logger.log(`[Worker] S${completedStage} health_score: ${healthScore}`);
    } catch (err) {
      this._logger.warn(`[Worker] Health score failed (non-fatal): ${err.message}`);
    }
  }

  async _advanceStage(ventureId, fromStage, toStage, context = {}) {
    const { result = null, durationMs = 0, advancementType = 'normal' } = context;

    // SD-LEO-INFRA-HARDEN-S19-S20-001 (FR-3): load-bearing choke-point backstop. _advanceStage is
    // the single side-effecting advance for ALL stages; an UNTRUSTED advance FROM Stage 19 of a
    // leo_bridge venture whose tree exists but is incomplete is the exact a14ff998/7610876f incident
    // (a pre_exec_skip path advanced DataDistill past S19 with a 26-SD all-draft tree). We re-assert
    // here (side-effect-free — we do NOT run the bridge; the entry gate already does) and REFUSE.
    // Strict on fromStage===19 so the other 24 stages short-circuit with zero extra queries. The
    // trusted gate-cleared advance may carry advancementType==='s19_bridge_cleared' to skip this.
    // FAIL-OPEN on evaluator error (a transient DB blip must not become fleet-wide denial-of-progress
    // — mirrors s20-pause-controller.js), emitting a system_events alarm instead of blocking.
    if (fromStage === 19 && advancementType !== 's19_bridge_cleared') {
      let buildComplete;
      try {
        buildComplete = await this._isLeoBridgeBuildComplete(ventureId);
      } catch (e) {
        await this._emitS19HardGateEvent(ventureId, 'S19_HARD_GATE_ADVANCE', {
          build_complete: null, reason: 'choke_point_eval_error_failopen',
          error: e.message, decided_by: 'advance_stage_backstop',
        });
        buildComplete = undefined; // fail open — fall through to the advance
      }
      // ===false means leo_bridge AND incomplete (null=non-leo_bridge falls through, never blocked).
      if (buildComplete === false) {
        // Distinguish an incomplete tree that EXISTS (the incident → refuse) from a venture with
        // nothing built (0 SDs: NOOP_EMPTY / a failure the entry gate owns → allow through here).
        let sdCount = 0;
        try {
          const { data: sds } = await this._supabase
            .from('strategic_directives_v2').select('id').eq('venture_id', ventureId);
          sdCount = (sds || []).length;
        } catch { /* unreadable → treat as 0 (fail open for the count) */ }
        if (sdCount > 0) {
          this._logger.error(
            `[Worker] _advanceStage S19 CHOKE-POINT (SD-LEO-INFRA-HARDEN-S19-S20-001): REFUSING untrusted advance of leo_bridge venture ${ventureId} past Stage 19 — tree exists but is incomplete (${sdCount} SDs, buildComplete=false, advancementType=${advancementType}).`
          );
          await this._emitS19HardGateEvent(ventureId, 'S19_HARD_GATE_BLOCK', {
            build_complete: false, sd_count: sdCount, from_stage: fromStage,
            reason: 'advance_stage_choke_point', decided_by: 'advance_stage_backstop',
            advancement_type: advancementType,
          });
          return { advanced: false, blocked: true, reason: 'advance_stage_choke_point' };
        }
      }
    }

    // SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001 (FR-1): chairman product-review choke-point backstop.
    // Mirrors the S19 backstop above — _advanceStage is the single side-effecting advance for the
    // daemon walk, so this is the one place that can enforce the hands-on pre-launch review no
    // matter which of the walk's many pre_exec_skip/re_entry/auto_approved/governance_override
    // paths reached here. Strict on fromStage===23 && toStage===24 so all other transitions
    // short-circuit with zero extra queries. The product-review decision is a SEPARATE
    // decision_type from the existing stage-23 kill-gate decision — never merged into one verdict
    // (out of scope: redefining the kill-gate policy). FAIL-OPEN on evaluator error (a transient
    // DB blip must not become fleet-wide denial-of-progress — mirrors the S19 backstop's contract).
    if (fromStage === 23 && toStage === 24) {
      let productReviewApproved;
      try {
        // QF-20260703-236-class guard: a fixture/demo venture can never get a real product_review
        // decision (requestProductReview's own isFixtureVenture skip guarantees one is never minted)
        // -- without this check it would block here FOREVER. Mirrors the fixture-venture handling
        // already established elsewhere in this method (the review-decision block above).
        const { isFixtureVenture, fetchVentureForFixtureCheck } = await import('./chairman-decision-watcher.js');
        const venture = await fetchVentureForFixtureCheck(this._supabase, ventureId, this._logger);
        if (isFixtureVenture(venture)) {
          productReviewApproved = true;
        } else {
          const { data: decision } = await this._supabase
            .from('chairman_decisions')
            .select('id')
            .eq('venture_id', ventureId)
            .eq('lifecycle_stage', 23)
            .eq('decision_type', 'product_review')
            .eq('status', 'approved')
            .limit(1)
            .maybeSingle();
          productReviewApproved = !!decision;
        }
      } catch (e) {
        this._logger.warn(`[Worker] Product-review choke-point eval error (fail-open): ${e.message}`);
        productReviewApproved = true; // fail open — fall through to the advance
      }
      if (!productReviewApproved) {
        this._logger.log(
          `[Worker] _advanceStage PRODUCT-REVIEW CHOKE-POINT (SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001): REFUSING advance of venture ${ventureId} from Stage 23 to Stage 24 — no approved chairman product_review decision found.`
        );
        // FR-2/FR-4: a block alone would strand the venture forever if nobody ever asks the
        // chairman. requestProductReview is idempotent (createOrReusePendingDecision reuses an
        // existing pending row; escalateChairmanDecision dedupes on escalation_email_sent_at), so
        // calling it on every blocked poll tick is safe — it mints+emails exactly once, then no-ops.
        try {
          const { requestProductReview } = await import('./chairman-product-review.js');
          await requestProductReview(this._supabase, ventureId, this._logger);
        } catch (askError) {
          this._logger.warn(`[Worker] requestProductReview failed (non-fatal, gate still enforced): ${askError.message}`);
        }
        return { advanced: false, blocked: true, reason: 'product_review_choke_point' };
      }
    }

    // SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001 (FR-2): artifact-precondition choke-point.
    // _advanceStage is the daemon-walk's single side-effecting advance for ALL stages -- prior to
    // this SD it performed the raw UPDATE below with ZERO artifact check, the most consequential
    // bypass of the required-artifact gate (the MarketLens incident's root cause). Mirrors the
    // S19/product-review backstops above: strict, fail-open on evaluator error, and short-circuits
    // with zero extra queries only in the sense that a stage with no required artifacts returns
    // blocked:false immediately. A documented deviation-ledger record for a specific missing
    // artifact (FR-6) is treated as satisfied, never a silent skip.
    const precondition = await checkStageArtifactPrecondition(this._supabase, ventureId, fromStage);
    if (precondition.blocked) {
      this._logger.error(
        `[Worker] _advanceStage ARTIFACT CHOKE-POINT (SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001): REFUSING advance of venture ${ventureId} from Stage ${fromStage} to ${toStage} — missing required artifact(s): ${precondition.missingArtifacts.join(', ')} (source=${precondition.source}).`
      );
      return {
        advanced: false,
        blocked: true,
        reason: 'artifact_precondition_unmet',
        missingArtifacts: precondition.missingArtifacts,
        source: precondition.source,
      };
    }

    // SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 (FR-3): high-consequence blocking-gate
    // choke-point — the 4th backstop in this function. Unlike the three backstops
    // above (S19/product-review/artifact), which FAIL OPEN on evaluator error to
    // avoid fleet-wide denial-of-progress, this one FAILS CLOSED: its entire
    // purpose is enforcing chairman authority over high-consequence stages, so an
    // evaluator error must hold advancement, not silently permit it. Mirrors the
    // S19 backstop's "short-circuit with zero extra queries" contract: the
    // (cached) governance classification is checked FIRST, so the overwhelming
    // majority of stages (not chairman-designated high-consequence) never touch
    // chairman_decisions or leo_feature_flags at all. A DB-level kill-switch
    // (leo_feature_flags.LEO_HIGH_CONSEQUENCE_GATES_ENABLED, default ON) allows
    // disabling the check fleet-wide without a code deploy if a bug is ever found
    // here (security-agent finding, evidence 7b374eff). Scoped by
    // lifecycle_stage = fromStage so a blocking decision at one stage never holds
    // advancement from a different stage. This mirrors the equivalent additive
    // check in fn_advance_venture_stage (same PR) — BOTH chokepoints must carry
    // it, since artifact-persistence-service.js delegates to the RPC via
    // supabase.rpc() and only inherits the hold from that side (risk-agent
    // finding, evidence 77870fa7).
    let highConsequenceBlocked;
    try {
      const gov = await getStageGovernance(this._supabase);
      if (!gov.isHighConsequence(fromStage)) {
        highConsequenceBlocked = false; // short-circuit — not a chairman-designated stage
      } else {
        // Both reads below MUST surface `error` explicitly and throw on it -- supabase-js
        // returns DB/PostgREST errors via `{data:null, error}` WITHOUT throwing, so a
        // data-only destructure would silently read `data` as null and compute a false
        // "not blocked" result, defeating the fail-closed contract this backstop exists
        // for (adversarial-review finding, PR #6104: this exact gap was live prior to fix).
        const { data: flagRow, error: flagErr } = await this._supabase
          .from('leo_feature_flags')
          .select('is_enabled')
          .eq('flag_key', 'LEO_HIGH_CONSEQUENCE_GATES_ENABLED')
          .maybeSingle();
        if (flagErr) throw flagErr;
        const flagEnabled = flagRow ? flagRow.is_enabled : true; // default ON when flag row absent
        if (!flagEnabled) {
          highConsequenceBlocked = false;
        } else {
          const { data: pendingBlockingDecision, error: decisionErr } = await this._supabase
            .from('chairman_decisions')
            .select('id')
            .eq('venture_id', ventureId)
            .eq('lifecycle_stage', fromStage)
            .eq('status', 'pending')
            .eq('blocking', true)
            .limit(1)
            .maybeSingle();
          if (decisionErr) throw decisionErr;
          highConsequenceBlocked = !!pendingBlockingDecision;
        }
      }
    } catch (e) {
      this._logger.error(`[Worker] High-consequence choke-point eval error (FAIL-CLOSED): ${e.message}`);
      highConsequenceBlocked = true; // fail closed — hold advancement on evaluator error
    }
    if (highConsequenceBlocked) {
      this._logger.log(
        `[Worker] _advanceStage HIGH-CONSEQUENCE CHOKE-POINT (SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001): REFUSING advance of venture ${ventureId} from Stage ${fromStage} to ${toStage} — pending high-consequence chairman decision.`
      );
      return { advanced: false, blocked: true, reason: 'high_consequence_gate_blocked' };
    }

    // Side-effect 1: Update ventures.current_lifecycle_stage
    await this._supabase
      .from('ventures')
      .update({ current_lifecycle_stage: toStage })
      .eq('id', ventureId);

    // Side-effect 2: Mark venture_stage_work as completed
    // RCA: _advanceStage is called by 5+ early-exit paths that skip _syncStageWork.
    // Using UPSERT ensures the row is created even if _syncStageWork was never called.
    const now = new Date().toISOString();
    let healthScore = 'green';
    let existingStartedAt = null;
    try {
      const { computeHealthScore } = await import('./health-score-computer.js');
      const { data: stageWork } = await this._supabase
        .from('venture_stage_work')
        .select('advisory_data, started_at')
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', fromStage)
        .maybeSingle();
      healthScore = computeHealthScore(stageWork?.advisory_data);
      existingStartedAt = stageWork?.started_at;
    } catch (err) {
      this._logger.warn(`[Worker] Health score computation failed (non-fatal): ${err.message}`);
    }

    // SD-FIX-STAGE-TIMING-ZEROS-ORCH-001-A: Use existing started_at if available,
    // otherwise compute from durationMs, otherwise fall back to now.
    // This ensures non-zero duration for all completed stages.
    let startedAt = existingStartedAt;
    if (!startedAt && durationMs > 0) {
      startedAt = new Date(Date.now() - durationMs).toISOString();
    }
    if (!startedAt) {
      startedAt = now;
    }

    await this._supabase
      .from('venture_stage_work')
      .upsert({
        venture_id: ventureId,
        lifecycle_stage: fromStage,
        stage_status: 'completed',
        work_type: 'artifact_only',
        health_score: healthScore,
        started_at: startedAt,
        completed_at: now,
        updated_at: now,
      }, { onConflict: 'venture_id,lifecycle_stage' });

    // Side-effect 3: Audit log
    this._logStageTransition(ventureId, fromStage, 'completed', durationMs, result).catch(() => {});

    // Side-effect 4: Post-stage hooks (Stitch S15, DocGen S17, SD Bridge S19)
    // Fire-and-forget to avoid blocking stage advancement (5-8 min delay on Path C)
    // Matches Paths A/B fix from SD-MAN-FIX-PIPELINE-HEALTH-GAPS-ORCH-001-C
    this._runPostStageHooks(ventureId, fromStage).catch(e =>
      this._logger.warn(`[Worker] Post-hook S${fromStage} failed (fire-and-forget): ${e.message}`));

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
    //
    // SD-LEO-FIX-VENTURE-STAGE-TRANSITIONS-001 FR-002: Split SELECT/INSERT
    // into separate try blocks, check Supabase {data, error} response shape
    // (Supabase v2 does NOT throw on row errors), and emit a structured
    // eva_orchestration_events row when audit writes fail. Logger escalated
    // warn→error. Non-fatal preserved — advance completes even if audit drops.
    let dedupOk = true;
    let existingTransition = null;
    try {
      const { data, error } = await this._supabase
        .from('venture_stage_transitions')
        .select('id')
        .eq('venture_id', ventureId)
        .eq('from_stage', fromStage)
        .eq('to_stage', toStage)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      existingTransition = data;
    } catch (selectErr) {
      dedupOk = false;
      await this._emitTransitionFailureEvent({
        venture_id: ventureId,
        from_stage: fromStage,
        to_stage: toStage,
        advancement_type: advancementType,
        failure_phase: 'dedup_guard_select',
        error_message: selectErr?.message || String(selectErr),
      });
      this._logger.error(`[SAE] Transition dedup guard SELECT failed (non-fatal): ${selectErr?.message || selectErr}`);
    }

    // Skip INSERT if dedup-guard failed — we cannot tell if a row already exists,
    // and a duplicate write is worse than a missed audit (which is already surfaced).
    if (dedupOk && !existingTransition) {
      try {
        const { error: insertErr } = await this._supabase
          .from('venture_stage_transitions')
          .insert({
            venture_id: ventureId,
            from_stage: fromStage,
            to_stage: toStage,
            transition_type: toValidTransitionType(advancementType),
          });
        if (insertErr) throw insertErr;
      } catch (insertErr) {
        await this._emitTransitionFailureEvent({
          venture_id: ventureId,
          from_stage: fromStage,
          to_stage: toStage,
          advancement_type: advancementType,
          failure_phase: 'insert',
          error_message: insertErr?.message || String(insertErr),
        });
        this._logger.error(`[SAE] Transition INSERT failed (non-fatal): ${insertErr?.message || insertErr}`);
      }
    }

    this._logger.log(`[SAE] Advanced S${fromStage} → S${toStage} (type=${advancementType}, venture=${ventureId.slice(0, 8)})`);
  }

  /**
   * Emit a structured observability event when a venture_stage_transitions
   * audit-trail write fails. Used by _advanceStage's dedup-guard SELECT and
   * INSERT failure paths so silent fails surface in eva_orchestration_events
   * for analytics + alerting.
   *
   * SD-LEO-FIX-VENTURE-STAGE-TRANSITIONS-001 FR-002.
   *
   * The eva_orchestration_events.chk_event_type CHECK constraint allows only
   * a fixed enum: stage_completed, stage_started, decision_requested,
   * decision_resolved, escalation, dfe_triggered, agent_communication,
   * health_score_changed, venture_created, venture_status_changed,
   * chairman_override, gate_passed, gate_failed, custom. We use 'escalation'
   * with metadata.subtype='transition_record_failed' so analytics can split
   * on subtype while staying schema-compatible.
   *
   * Non-fatal: if event emission itself fails, log and move on — this is the
   * last-resort surfacing layer.
   *
   * @param {Object} payload
   * @param {string} payload.venture_id
   * @param {number} payload.from_stage
   * @param {number} payload.to_stage
   * @param {string} payload.advancement_type
   * @param {string} payload.failure_phase - 'dedup_guard_select' | 'insert'
   * @param {string} payload.error_message
   */
  async _emitTransitionFailureEvent(payload) {
    try {
      const { error } = await this._supabase
        .from('eva_orchestration_events')
        .insert({
          event_type: 'escalation',
          event_source: 'stage_execution_worker',
          venture_id: payload.venture_id,
          event_data: {
            subtype: 'transition_record_failed',
            from_stage: payload.from_stage,
            to_stage: payload.to_stage,
            advancement_type: payload.advancement_type,
            failure_phase: payload.failure_phase,
            error_message: payload.error_message,
            sd_origin: 'SD-LEO-FIX-VENTURE-STAGE-TRANSITIONS-001',
          },
          chairman_flagged: false,
        });
      if (error) {
        this._logger.error(`[SAE] Failed to emit transition_record_failed event (last-resort): ${error.message}`);
      }
    } catch (eventErr) {
      this._logger.error(`[SAE] Failed to emit transition_record_failed event (last-resort): ${eventErr?.message || eventErr}`);
    }
  }

  /**
   * Run any registered post-stage hooks for the completed stage.
   * Non-fatal: failures log warnings but never block advancement.
   * @param {string} ventureId
   * @param {number} completedStage - The stage that just finished
   */
  /** ctx surface the relocated stage handlers consume (FR-2 enumeration). */
  _stageHandlerCtx(ventureId) {
    return {
      supabase: this._supabase,
      logger: this._logger,
      ventureId,
      ensureS17StrategySelected: (vId) => this._ensureS17StrategySelected(vId),
    };
  }

  async _runPostStageHooks(ventureId, completedStage) {
    // SD-ARCH-HOTSPOT-STAGE-WORKER-001 (FR-3): externalized-registry dispatch first;
    // the internal Map remains the kill-switch path AND the home of S19 (not in the
    // external registry). runStageHandler is fail-soft with this method's exact
    // posture, so behavior is identical on both paths.
    if (stageHandlerRegistry.isRegistryEnabled()) {
      const handled = await stageHandlerRegistry.runStageHandler(completedStage, this._stageHandlerCtx(ventureId));
      if (handled) return;
    }

    // FR-1 (SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-E): per-stage reflection emission.
    // Runs for EVERY completed stage, independent of whether a stage-specific hook is
    // registered below. Sources lessonText from the artifact this stage actually wrote
    // (if any) rather than a generic "stage N completed" string, so the FR-2 quality-floor
    // guard has real content to score against instead of structurally-boilerplate text.
    // Fail-open: never throws, never blocks the stage-specific hook dispatch below.
    this._emitPostStageReflection(ventureId, completedStage).catch((e) =>
      this._logger.warn(`[Worker] Post-stage reflection S${completedStage} failed (non-fatal): ${e.message}`)
    );

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
   * FR-1 per-stage reflection: reads the most recent venture_artifacts row this stage
   * itself wrote (title + content), and if one exists, emits it as a traversal
   * reflection. No artifact for this stage → no-op (most stages on most traversals will
   * have nothing new to reflect on, which is correct — see lesson-quality-guard.js).
   */
  async _emitPostStageReflection(ventureId, completedStage) {
    const { data: artifact } = await this._supabase
      .from('venture_artifacts')
      .select('title, content, artifact_type')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', completedStage)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!artifact) return;

    const lessonText = `${artifact.title || `Stage ${completedStage} ${artifact.artifact_type || 'artifact'}`}: ${String(artifact.content || '').slice(0, 500)}`;
    await emitTraversalReflection(this._supabase, {
      ventureId,
      lessonText,
      metadataExtra: {
        lifecycle_stage: completedStage,
        hook: 'post_stage_completed',
        artifact_type: artifact.artifact_type,
      },
    }, { logger: this._logger });
  }


  /**
   * SD-S17-WORKER-STRATEGY-GATE-ORCH-001-A: Ensure strategy selection is complete.
   * Checks for existing approved strategy_selection decision. If none exists,
   * runs strategy-recommender, creates a chairman_decision, and blocks.
   * Returns the selected strategy name (or null if chairman chose "use all").
   *
   * @param {string} ventureId
   * @returns {Promise<string|null>} selected strategy name or null
   */
  async _ensureS17StrategySelected(ventureId) {
    // Check for existing strategy_selection decision (re-entry safe)
    const { data: existingDecision } = await this._supabase
      .from('chairman_decisions')
      .select('id, status, decision, metadata') // pre-existing phantom ref (pre-dates SD-LEO-FIX-PERSIST-KILL-GATE-001; tracked via feedback) schema-lint-disable-line
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 17)
      .eq('metadata->>decision_type', 'strategy_selection')
      .limit(1)
      .maybeSingle();

    if (existingDecision?.status === 'approved') {
      const strategy = existingDecision.metadata?.strategy || null;
      this._logger.log(`[Worker] S17 strategy gate: already approved (strategy: ${strategy || 'all'})`);
      return strategy;
    }

    if (existingDecision?.status === 'pending') {
      // Re-entry: block on existing pending decision
      this._logger.log('[Worker] S17 strategy gate: re-blocking on existing pending decision');
      await waitForDecision({ decisionId: existingDecision.id, supabase: this._supabase, logger: this._logger, timeoutMs: 0 });
      // Re-query decision to get metadata.strategy (waitForDecision doesn't return full row)
      const { data: resolved } = await this._supabase
        .from('chairman_decisions')
        .select('metadata') // pre-existing phantom ref (pre-dates SD-LEO-FIX-PERSIST-KILL-GATE-001; tracked via feedback) schema-lint-disable-line
        .eq('id', existingDecision.id)
        .single();
      return resolved?.metadata?.strategy || null;
    }

    // No decision exists — run strategy recommender and create one
    this._logger.log('[Worker] S17 strategy gate: running strategy recommender...');
    const { recommendStrategies } = await import('./stage-17/strategy-recommender.js');
    const recommendation = await recommendStrategies(ventureId, this._supabase);
    this._logger.log(`[Worker] S17 strategy gate: recommendation complete (top: ${recommendation?.ranked_strategies?.[0]?.strategy || 'unknown'})`);

    // Create chairman_decision for strategy selection
    const { id: decisionId, reason: skipReason } = await createOrReusePendingDecision({
      ventureId,
      stageNumber: 17,
      briefData: {
        stage: 17,
        gate_recommendation: 'STRATEGY_SELECTION',
        decision_type: 'strategy_selection',
        ranked_strategies: recommendation?.ranked_strategies || [],
      },
      summary: 'Select design strategy direction before archetype generation',
      decisionType: 'strategy_selection',
      supabase: this._supabase,
    });

    // QF-20260703-236: a fixture venture never gets a real decisionId (skipped:true,
    // id:null) — waitForDecision throws on a falsy decisionId, and no real row will
    // ever exist to be approved. Auto-select the top-ranked recommendation instead
    // of blocking/throwing, matching what the S17 parity pipeline needs to keep moving.
    // Scoped to reason==='fixture_venture' specifically -- see the identical comment in
    // _handleChairmanGate for why a bare `skipped` check is unsafe here.
    if (skipReason === 'fixture_venture') {
      const autoStrategy = recommendation?.ranked_strategies?.[0]?.strategy || null;
      this._logger.log(`[Worker] S17 strategy gate: skipped for fixture venture ${ventureId} — auto-selecting top recommendation (${autoStrategy || 'all'})`);
      return autoStrategy;
    }

    this._logger.log(`[Worker] S17 strategy gate: blocking on decision ${decisionId}`);
    await waitForDecision({ decisionId, supabase: this._supabase, logger: this._logger, timeoutMs: 0 });
    // Re-query decision to get metadata.strategy (waitForDecision doesn't return full row)
    const { data: decided } = await this._supabase
      .from('chairman_decisions')
      .select('metadata') // pre-existing phantom ref (pre-dates SD-LEO-FIX-PERSIST-KILL-GATE-001; tracked via feedback) schema-lint-disable-line
      .eq('id', decisionId)
      .single();
    const selectedStrategy = decided?.metadata?.strategy || null;
    this._logger.log(`[Worker] S17 strategy gate: approved (strategy: ${selectedStrategy || 'all'})`);
    return selectedStrategy;
  }

  /**
   * S19 post-stage hook: Convert sprint plan → LEO Strategic Directives via lifecycle-sd-bridge.
   *
   * SD-LEO-INFRA-RELIABLE-S19-BUILD-001 / FR-2: this is now a THIN WRAPPER around the
   * synchronous _runS19Bridge (defense-in-depth — the synchronous S19 entry gate is the
   * primary path that blocks advancement; this fire-and-forget post-stage hook stays as a
   * net, with its NC-7 escalation block intact inside _runS19Bridge).
   *
   * @param {string} ventureId
   */
  async _postStageHook_S19_Bridge(ventureId) {
    await this._runS19Bridge(ventureId);
  }

  /**
   * SD-LEO-INFRA-CLONE-SEED-L2-VISION-PROMOTE-001: CLONE-SCOPED auto-promotion of an enriched L2 vision
   * to active + chairman_approved, attributed to the testing agent, so a clone can pass the S19
   * vision_approval gate (assertVentureVisionReady requires status='active' AND chairman_approved=true).
   * Clones have no chairman to approve their vision; the CONTENT is already enriched by eager-synthesis,
   * so the gap is purely PROMOTION/APPROVAL — this does NOT re-implement enrichment.
   *
   * Two promotable shapes are handled (LEAD validation): eager-synthesis lands clones as
   * status='active'+unapproved (the going-forward common case) → FLIP approval only; the older S17 seed
   * lands status='draft_seed'+unapproved → promote draft_seed→active+approved. Both via a TARGETED UPDATE
   * (never upsertVision, which writes extracted_dimensions: dimensions||null and would NULL-clobber the
   * enriched dims, violating eva_vision_documents_active_rich_check).
   *
   * REAL ventures (seeded_from_venture_id IS NULL, non-convergence) are NEVER auto-approved — chairman-manual
   * approval is preserved and assertVentureVisionReady/shouldHoldAtS19 are untouched. SD-LEO-INFRA-REAL-VENTURE-
   * VISION-ENRICH-UNDERPRODUCTION-S19-001-B (FR-1/FR-2/FR-3): a real venture DOES still reach the Case B
   * section-completion repair loop (reason='repaired_not_promoted' on success/already-quality_checked, or an
   * existing active L2 short-circuits with reason='real_venture_active_present') — only the two write points
   * that would flip status/chairman_approved are gated on eligibility, not the read/repair path. Idempotent
   * (no-op once approved), constraint-safe (only promotes a row already passing active_rich_check; respects
   * the active-L2 partial unique index), and fail-soft (never throws into the S19 gate).
   *
   * @param {string} ventureId
   * @returns {Promise<{ promoted: boolean, reason?: string, vision_key?: string, mode?: string, error?: string }>}
   */
  async _autoApproveCloneVision(ventureId) {
    try {
      if (!ventureId || !this._supabase) return { promoted: false, reason: 'missing_deps' };
      // ventures.seeded_from_venture_id is the canonical clone-origin marker (added to the schema-reference
      // snapshot in this PR so the lint recognizes it — it exists live: clones 091f2889/4e710bb2/886d2dc3 carry it).
      const { data: venture } = await this._supabase
        .from('ventures').select('id, seeded_from_venture_id').eq('id', ventureId).maybeSingle();
      if (!venture) return { promoted: false, reason: 'venture_not_found' };
      // Carve-out: only an AUTO-APPROVE-ELIGIBLE venture is auto-approved/auto-activated (a REAL venture
      // stays chairman-manual for promotion). Eligible = a CLONE (seeded_from_venture_id) OR a non-clone
      // CONVERGENCE SUBJECT (SD-LEO-INFRA-NONCLONE-VISION-S19-ACTIVATION-BLOCK-001 — marked by
      // launchNonCloneDummy). The convergence-subject read runs ONLY for non-clones (the clone fast-path
      // is unchanged).
      //
      // SD-LEO-INFRA-REAL-VENTURE-VISION-ENRICH-UNDERPRODUCTION-S19-001-B (FR-1): autoApproveEligible no
      // longer early-returns here. A real venture is NEVER auto-approved (that invariant is unchanged —
      // see the two autoApproveEligible checks below, immediately before each write point), but it MUST
      // still reach the section-completion repair path in Case B — otherwise its L2 vision is permanently
      // capped at the base writer's 3-4/10 structural ceiling and can never satisfy
      // trg_enforce_vision_quality_advancement even under an explicit chairman approval later. Safe now
      // that Child A (SD-...-S19-001-A) makes repeated repair writes clobber-safe.
      let autoApproveEligible = true;
      if (!venture.seeded_from_venture_id) {
        const convergenceSubject = await isConvergenceSubject(this._supabase, ventureId);
        autoApproveEligible = convergenceSubject;
        if (convergenceSubject) {
          this._logger?.log?.(`[Worker] S19: non-clone CONVERGENCE SUBJECT ${ventureId} is auto-approve-eligible (convergence_subject marker) — activating its quality-passed vision on the normal path`);
        } else {
          this._logger?.log?.(`[Worker] S19: REAL venture ${ventureId} is not auto-approve-eligible — running section-completion repair only (chairman-manual approval preserved)`);
        }
      }

      // Case A — an ACTIVE L2 already exists (eager-synthesis going-forward shape).
      const { data: active } = await this._supabase
        .from('eva_vision_documents')
        .select('vision_key, chairman_approved')
        .eq('venture_id', ventureId).eq('level', 'L2').eq('status', 'active')
        .limit(1).maybeSingle();
      if (active) {
        // FR-2: a real venture with an existing active L2 is never touched by this function — chairman
        // approval of an already-active doc remains a fully manual, explicit action.
        if (!autoApproveEligible) return { promoted: false, reason: 'real_venture_active_present' };
        if (active.chairman_approved === true) return { promoted: false, reason: 'already_approved' };
        // Flip approval ONLY — no status churn (no unique-index collision), dims/content untouched.
        const { error } = await this._supabase
          .from('eva_vision_documents')
          .update({ chairman_approved: true, chairman_approved_at: new Date().toISOString(), created_by: 'testing-agent-clone-autoapprove' })
          .eq('vision_key', active.vision_key).eq('level', 'L2');
        if (error) { this._logger?.warn?.(`[Worker] clone vision approval-flip failed (non-fatal): ${error.message}`); return { promoted: false, reason: 'update_failed', error: error.message }; }
        this._logger?.log?.(`[Worker] S19: clone vision approval flipped (testing_agent): venture ${ventureId} ${active.vision_key} active(unapproved) -> approved`);
        return { promoted: true, vision_key: active.vision_key, mode: 'approve_active' };
      }

      // Case B — no active L2: promote the enriched pre-active L2. The eligible venture's L2 doc lands in
      // one of TWO pre-active shapes: 'draft_seed' (the older S17 auto-draft seed shape, clones) OR 'draft'
      // (the from-scratch eager-synthesis shape a NON-CLONE convergence subject actually produces —
      // SD-LEO-INFRA-NONCLONE-VISION-S19-DRAFT-DOC-SHAPE-001, the #5284 reachability follow-up). Matching
      // ONLY 'draft_seed' let a convergence subject's 'draft' doc fall through to no_l2_vision, so the repair
      // never fired and S19 still stalled though eligibility was fixed. Match BOTH; the freshest wins. This
      // runs ONLY for an auto-approve-ELIGIBLE venture (clone OR convergence subject — the real_venture gate
      // above is unchanged), so a REAL venture's draft L2 is never touched (chairman-manual preserved).
      const { data: seed } = await this._supabase
        .from('eva_vision_documents')
        .select('vision_key, status, extracted_dimensions, content, quality_checked, quality_issues, sections, source_brainstorm_id')
        .eq('venture_id', ventureId).eq('level', 'L2').in('status', ['draft_seed', 'draft'])
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (!seed) return { promoted: false, reason: 'no_l2_vision' };
      // Must already pass active_rich_check (eager-synthesis enriched it) or the UPDATE violates the CHECK.
      const enriched = seed.extracted_dimensions != null
        && typeof seed.content === 'string' && seed.content.length > 500;
      if (!enriched) return { promoted: false, reason: 'not_enriched' };

      // SD-LEO-INFRA-CLONE-VISION-AUTOPROMOTE-QUALITY-REPAIR-001: a status='active' UPDATE is blocked by
      // trg_enforce_vision_quality_advancement when quality_checked=false (the seed has <8 of the 10 standard
      // sections — #5234 checked dims+content but not quality). Repair the seed to >=8 sections via the
      // EXISTING bounded repair loop (the trigger flips quality_checked=true on a sufficient repair), THEN
      // promote. If repair is disabled or exhausts WITHOUT quality_checked=true, fall through to the
      // vision_approval gate — no bad 'active' row, no silent bypass, no weakening of the quality trigger.
      if (seed.quality_checked !== true) {
        const flagOn = await isRepairLoopEnabled({ supabase: this._supabase, ventureId });
        if (!flagOn) return { promoted: false, reason: 'quality_not_checked' };
        const repair = await repairVision({
          supabase: this._supabase,
          visionKey: seed.vision_key,
          qualityIssues: Array.isArray(seed.quality_issues) ? seed.quality_issues : [],
          sections: seed.sections,
          content: seed.content,
          createdBy: 'testing-agent-clone-autoapprove',
          ventureId,
          brainstormId: seed.source_brainstorm_id || undefined,
          level: 'L2',
          // Section-level enrichment fallback (mirrors stage-17-doc-generation): fills missing/stub
          // standard sections so the section-coverage check passes. Real LLM regeneration is layered on
          // upstream via injection; this fallback guarantees the bounded loop can satisfy the gate.
          regenerate: async ({ hint, sections, issue }) => {
            const targetCheck = issue?.check;
            const updated = { ...(sections || {}) };
            if (targetCheck === 'content_length' || targetCheck === 'section_content') {
              for (const key of Object.keys(updated)) updated[key] = `${updated[key] || ''}\n\n${hint}`;
            } else if (targetCheck === 'section_coverage' || targetCheck === 'sections_missing') {
              const standard = ['executive_summary', 'problem_statement', 'success_criteria', 'personas', 'out_of_scope', 'evolution_plan', 'information_architecture', 'key_decision_points', 'integration_patterns', 'ui_ux_wireframes'];
              for (const key of standard) {
                if (!updated[key] || String(updated[key]).length < 50) updated[key] = `${hint}\n\n[Generated for ${key}]`;
              }
            }
            const newContent = Object.entries(updated)
              .map(([k, b]) => `## ${k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}\n\n${b}`)
              .join('\n\n');
            return { sections: updated, content: newContent, tokensUsed: 0 };
          },
          logger: this._logger,
        });
        if (repair?.finalQualityChecked !== true) {
          this._logger?.warn?.(`[Worker] S19: clone vision repair exhausted without quality_checked (exit=${repair?.exitReason}, attempts=${repair?.attempts}); falling through to the vision_approval gate for venture ${ventureId}`);
          return { promoted: false, reason: 'repair_exhausted_quality', exitReason: repair?.exitReason };
        }
        this._logger?.log?.(`[Worker] S19: clone vision repaired to quality_checked (attempts=${repair?.attempts}) for venture ${ventureId} ${seed.vision_key}`);
      }

      // FR-3: the seed is now quality_checked=true (either it already was, or the repair loop above just
      // got it there) — but a real venture stops HERE. Its sections/content were repaired in place via
      // upsertVision inside repairVision (status/chairman_approved untouched by that call), so the vision
      // is no longer capped below the quality-advancement trigger's threshold; an explicit chairman
      // approval can now succeed without this function ever performing the activation itself.
      if (!autoApproveEligible) return { promoted: false, reason: 'repaired_not_promoted', vision_key: seed.vision_key };

      const { error } = await this._supabase
        .from('eva_vision_documents')
        .update({ status: 'active', chairman_approved: true, chairman_approved_at: new Date().toISOString(), created_by: 'testing-agent-clone-autoapprove' })
        .eq('vision_key', seed.vision_key).eq('level', 'L2');
      if (error) { this._logger?.warn?.(`[Worker] clone vision auto-promote failed (non-fatal): ${error.message}`); return { promoted: false, reason: 'update_failed', error: error.message }; }
      this._logger?.log?.(`[Worker] S19: vision auto-promoted (testing_agent): venture ${ventureId} ${seed.vision_key} ${seed.status} -> active+approved`);
      return { promoted: true, vision_key: seed.vision_key, mode: 'promote_draft' };
    } catch (e) {
      this._logger?.warn?.(`[Worker] _autoApproveCloneVision error (non-fatal): ${e?.message || e}`);
      return { promoted: false, reason: 'exception', error: e?.message || String(e) };
    }
  }

  /**
   * SD-LEO-INFRA-RELIABLE-S19-BUILD-001 / FR-2: synchronous S19 bridge run.
   *
   * Extracted from the former _postStageHook_S19_Bridge body so the SYNCHRONOUS S19 entry
   * gate can await it and BLOCK advancement on a real failure (e.g. VENTURE_L2_VISION_MISSING)
   * instead of the venture silently advancing past S19 via the fire-and-forget hook.
   *
   * Queries S19 artifacts for sd_bridge_payloads, creates orchestrator + child SDs.
   * Keeps the NC-7 anti-silent-no-op escalation block as a net.
   *
   * @param {string} ventureId
   * @returns {Promise<{ created: boolean, errors: any, orchestratorKey: string|null, childKeys: string[] }>}
   */
  async _runS19Bridge(ventureId) {
    // SD-LEO-INFRA-S19-CLONE-VISION-PROMOTE-ORDER-001 (FR-1): clone-scoped auto-promotion of an
    // enriched L2 vision to active+chairman_approved (testing_agent) BEFORE the bridge's vision
    // check (assertVentureVisionReady) — at the TOP of the SHARED callee so EVERY entry point
    // inherits it: the S19 hard-gate run-then-recheck (~L690), the sync-gate fast-path/primary
    // (~L1479/L1500), and the fire-and-forget _postStageHook_S19_Bridge (~L3424). The prior
    // single call site (the sync entry gate only) left a clone arriving via the hard-gate or
    // post-hook path un-promoted → it blocked on vision_missing. Fail-soft for REAL ventures; never
    // auto-promotes them (SD-...-S19-001-B: reason='repaired_not_promoted' / 'real_venture_active_present'
    // on the non-eligible paths, no status/chairman_approved write either way); idempotent once approved.
    // Does NOT change the promote's internals — the #5237 isRepairLoopEnabled kill-switch and #5235
    // force-approve-backdoor closure are preserved.
    await this._autoApproveCloneVision(ventureId);

    // SD-LEO-FEAT-CLOSE-DISTINCTIVENESS-GAP-001 (adversarial W2): select archetype too so the
    // award-library sampler's archetype bias actually engages on the live path.
    const { data: ventureRow } = await this._supabase
      .from('ventures').select('name, archetype').eq('id', ventureId).single();

    // build_method='replit_agent' is the retained behavioral enum for the post-cost-pivot
    // SINGLE build model (SD-LEO-FEAT-FINALIZE-CLAUDE-CODE-001): skip per-venture SD creation
    // because venture features are governed by the stage pipeline + the S20 Code Quality Gate,
    // NOT by LEO platform SDs. The venture is built by Claude Code from the seeded GitHub repo
    // (CLAUDE.md + docs/build-tasks.md) and hosted on Replit. (Legacy ref: SD-LEO-INFRA-REPLIT-ALTERNATIVE-BUILD-001.)
    const { data: s19Work } = await this._supabase
      .from('venture_stage_work')
      .select('advisory_data')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 19)
      .maybeSingle();

    // SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 (RCA 813d4c3d): single arbiter (ventures.build_model
    // SSOT) decides — NOT this hook independently checking build_method. Skip LEO-SD creation only for
    // the seeded path; for leo_bridge, fall through to convertSprintToSDs.
    const { data: ventureBM2 } = await this._supabase
      .from('ventures').select('build_model').eq('id', ventureId).maybeSingle();
    const { resolveBuildModel } = await import('./bridge/resolve-build-model.js');
    const buildModel = resolveBuildModel({
      ventureBuildModel: ventureBM2?.build_model,
      legacyBuildMethod: s19Work?.advisory_data?.build_method,
    });
    if (buildModel === 'seeded_repo') {
      this._logger.log(
        '[Worker] S19 Bridge: build_model=seeded_repo — skipping per-venture SD creation. Venture is built by Claude Code from the seeded repo; Replit hosts.'
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
      // seeded_repo never creates SDs — treat as "created:true" so the gate proceeds (the
      // seeded_repo branch of the entry gate handles its own repo-seeding block separately).
      // SD-LEO-INFRA-HARDEN-S19-S20-001 (FR-1): tag the explicit outcome.
      return { created: true, errors: [], orchestratorKey: null, childKeys: [], outcome: S19_BRIDGE_OUTCOME.CREATED };
    }
    this._logger.log('[Worker] S19 Bridge: build_model=leo_bridge — creating orchestrator + child SDs via convertSprintToSDs.');

    // Verify venture provisioning before SD bridge conversion
    await this._verifyAndProvisionVenture(ventureId, ventureRow?.name);

    // Fetch sd_bridge_payloads from S19 artifacts (fallback to S18 for legacy data)
    // SD-LEO-INFRA-S19-DUPLICATE-ORCHESTRATOR-TREE-001 (FR-1a): EXCLUDE the bridge's OWN output
    // (artifact_type='lifecycle_sd_bridge'). The bridge writes its own is_current artifact, so on a
    // re-invocation artifacts[0] used to be that output (carrying no sprint_name) -> sprint_name='unknown'
    // -> a divergent SPRINT-UNKNOWN orchestrator that evaded dedup -> a DUPLICATE build tree.
    const { data: artifacts } = await this._supabase
      .from('venture_artifacts')
      .select('content, metadata')
      .eq('venture_id', ventureId)
      .in('lifecycle_stage', [19, 18])
      .eq('is_current', true)
      .neq('artifact_type', 'lifecycle_sd_bridge')
      .order('lifecycle_stage', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);

    let sdBridgePayloads = [];
    // SD-LEO-INFRA-S19-DUPLICATE-ORCHESTRATOR-TREE-001 (FR-1b): capture the content+meta of the SAME
    // artifact that supplied the payloads, so sprint_name/goal/duration derive from the real sprint plan
    // (deterministic across re-invocations) instead of artifacts[0] (which could be a different/own row).
    let sprintSourceContent = {};
    let sprintSourceMeta = {};
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
        sprintSourceContent = content || {};
        sprintSourceMeta = meta || {};
        break;
      }
    }

    if (sdBridgePayloads.length === 0) {
      this._logger.log('[Worker] S19 post-stage hook: No sd_bridge_payloads found in artifacts');
      // No payloads = nothing to build; not a vision failure.
      // SD-LEO-INFRA-HARDEN-S19-S20-001 (FR-1): NOOP_EMPTY is the ONLY incomplete state that still
      // advances past S19 — shouldHoldAtS19 distinguishes it from a ZERO_SDS_FAILURE (payloads>0,
      // 0 SDs), which otherwise looks identical (both created:false + empty errors + 0 SDs).
      return { created: false, errors: [], orchestratorKey: null, childKeys: [], outcome: S19_BRIDGE_OUTCOME.NOOP_EMPTY };
    }

    // Query EVA records for vision_key and plan_key.
    // SD-LEO-INFRA-RELIABLE-S19-BUILD-001 / FR-3: filter to the gate-ACCEPTED doc
    // (level='L2', status='active', chairman_approved=true) so the advisory vision_key
    // equals what assertVentureVisionReady accepts. A venture with only an L1 + an
    // unapproved draft_seed L2 yields vision_key=null.
    const { data: visionDoc } = await this._supabase
      .from('eva_vision_documents')
      .select('vision_key')
      .eq('venture_id', ventureId)
      .eq('level', 'L2')
      .eq('status', 'active')
      .eq('chairman_approved', true)
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

    const { convertSprintToSDs, buildBridgeArtifactRecord, sprintSignature } = await import('./lifecycle-sd-bridge.js');
    const { writeArtifact } = await import('./artifact-persistence-service.js');

    // SD-LEO-INFRA-S19-DUPLICATE-ORCHESTRATOR-TREE-001 (FR-1c/FR-3): build the sprint meta from the
    // payload-SOURCE artifact (captured above), NOT artifacts[0]. The fallback when the source carries no
    // sprint_name is a DETERMINISTIC, payload-derived label (sprint-<signature>) — never the literal
    // 'unknown', which used to mint a divergent SPRINT-UNKNOWN key + a duplicate build tree.
    const stageOutput = {
      sd_bridge_payloads: sdBridgePayloads,
      sprint_name: sprintSourceContent?.sprint_name || sprintSourceMeta?.sprint_name || `sprint-${sprintSignature(sdBridgePayloads)}`,
      sprint_goal: sprintSourceContent?.sprint_goal || sprintSourceMeta?.sprint_goal || '',
      sprint_duration_days: sprintSourceContent?.sprint_duration_days || sprintSourceMeta?.sprint_duration_days || 14,
    };

    // archetype threads through to the award-library sampler (adversarial W2 fix).
    const ventureContext = { id: ventureId, name: ventureRow?.name, archetype: ventureRow?.archetype || null };
    const evaKeys = {
      vision_key: visionDoc?.vision_key || null,
      plan_key: archPlan?.plan_key || null,
    };

    const bridgeResult = await convertSprintToSDs(
      { stageOutput, ventureContext, evaKeys },
      { supabase: this._supabase, logger: this._logger },
    );

    // SD-LEO-INFRA-S19-NC7-ESCALATION-DIVERGENT-REDERIVATION-001 (FR-1): compute the canonical outcome
    // BEFORE the branching so the NC-7 escalation gates on the SAME classifyBridgeOutcome enum every
    // other S19 consumer uses — never an inline errors-text regex. The #5250 dedup returns errors:[],
    // so the old `/already exists/i.test(JSON.stringify(errors))` never matched and a healthy NOOP_EXISTS
    // re-run was mislabeled 'Bridge FAILED' + wrote a stale stage_status='blocked'/bridge_failed row.
    const bridgeOutcome = classifyBridgeOutcome({
      created: bridgeResult.created === true,
      skipped: bridgeResult.skipped === true,
      errors: bridgeResult.errors || bridgeResult.error || [],
      orchestratorKey: bridgeResult.orchestratorKey || null,
    }, sdBridgePayloads.length);

    if (bridgeResult.created) {
      this._logger.log(`[Worker] S19 bridge: Created orchestrator ${bridgeResult.orchestratorKey} with ${bridgeResult.childKeys.length} children`);

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
    } else if (bridgeResult.skipped === true) {
      // SD-LEO-INFRA-PILOT-VENTURE-GUARD-001: a pilot/test-fixture venture is INTENTIONALLY not
      // built out (V1/V2 boundary). This is NOT a bridge failure — do NOT log FAILED or escalate
      // the venture to S19 BLOCKED. The pilot advances through the pipeline without a build tree
      // (the PILOT_SKIPPED outcome makes shouldHoldAtS19 advance, like NOOP_EMPTY).
      this._logger.log(`[Worker] S19 bridge: venture ${ventureId} is a pilot/test-fixture — venture-build SD generation gated (${bridgeResult.reason || 'pilot/test-fixture'}). Not a failure.`);
    } else {
      const errors = bridgeResult.errors || bridgeResult.error || 'unknown';
      // SD-LEO-INFRA-S19-NC7-ESCALATION-DIVERGENT-REDERIVATION-001 (FR-1): gate the NC-7 escalation on
      // the canonical bridgeOutcome enum — NOT the dead `/already exists/i` errors-text regex. The #5250
      // dedup returns errors:[], so the old regex never matched and a healthy idempotent NOOP_EXISTS
      // re-run was mislabeled 'Bridge FAILED' + wrote a stale stage_status='blocked'/bridge_failed row.
      // Escalate ONLY genuine failures (NC-7 anti-silent-no-op, RCA 813d4c3d CAPA: payloads-but-0-SDs,
      // an infra throw, or a missing vision must surface on the dashboard rather than advance un-built).
      // Idempotent / nothing-to-build outcomes (NOOP_EXISTS, NOOP_EMPTY) are NOT failures — info log,
      // write NOTHING.
      const isGenuineFailure =
        bridgeOutcome === S19_BRIDGE_OUTCOME.ZERO_SDS_FAILURE ||
        bridgeOutcome === S19_BRIDGE_OUTCOME.BRIDGE_THREW ||
        bridgeOutcome === S19_BRIDGE_OUTCOME.VISION_MISSING;
      if (!isGenuineFailure) {
        this._logger.log(`[Worker] S19 bridge: venture ${ventureId} no-op (${bridgeOutcome}${bridgeResult.orchestratorKey ? `, existing tree ${bridgeResult.orchestratorKey}` : ''}) — not a failure, no escalation.`);
      } else {
        this._logger.error(`[Worker] S19 bridge: venture ${ventureId} ${bridgeOutcome}. Errors: ${JSON.stringify(errors)}`);
        try {
          await this._supabase.from('venture_stage_work').upsert({
            venture_id: ventureId,
            lifecycle_stage: 19,
            stage_status: 'blocked',
            work_type: 'sd_required',
            advisory_data: {
              build_model: 'leo_bridge',
              bridge_failed: true,
              bridge_outcome: bridgeOutcome,
              bridge_errors: errors,
              payload_count: sdBridgePayloads.length,
              escalated_at: new Date().toISOString(),
            },
          }, { onConflict: 'venture_id,lifecycle_stage' });
          this._logger.error(`[Worker] S19 NC-7 escalation: marked venture ${ventureId} S19 BLOCKED (${bridgeOutcome}, ${sdBridgePayloads.length} payloads).`);
        } catch (escErr) {
          this._logger.warn(`[Worker] S19 NC-7 escalation upsert failed: ${escErr.message}`);
        }
      }
    }

    // FR-2: return the bridge outcome so the synchronous S19 entry gate can discriminate
    // created:true / idempotency-no-op / real-failure and block advancement accordingly.
    // SD-LEO-INFRA-HARDEN-S19-S20-001 (FR-1): attach the canonical outcome enum so all consumers
    // share ONE discriminant instead of re-deriving idempotency inline (the schism root cause).
    const result = {
      created: bridgeResult.created === true,
      // SD-LEO-INFRA-PILOT-VENTURE-GUARD-001: carry the pilot-skip flag so classifyBridgeOutcome
      // can return PILOT_SKIPPED instead of mis-reading an intentional skip as ZERO_SDS_FAILURE.
      skipped: bridgeResult.skipped === true,
      errors: bridgeResult.errors || bridgeResult.error || [],
      orchestratorKey: bridgeResult.orchestratorKey || null,
      childKeys: bridgeResult.childKeys || [],
    };
    // SD-LEO-INFRA-S19-NC7-ESCALATION-DIVERGENT-REDERIVATION-001 (FR-1): reuse the outcome computed
    // before branching — one classifyBridgeOutcome call drives both the escalation gate and this return,
    // so the escalation decision and the reported outcome can never diverge.
    result.outcome = bridgeOutcome;
    return result;
  }

  /**
   * SD-LEO-INFRA-ENFORCE-S19-COMPLETION-001 (FR-1, shared evaluator): is a leo_bridge venture's
   * Stage-19 build COMPLETE — i.e. an orchestrator + child SD tree exists for the venture and every
   * SD has reached a terminal state with at least one genuinely completed (a tree that is ALL
   * cancelled is NOT a completed build). This is the single source of truth for the S19 hard gate
   * (here) and the S20 pause controller (lib/eva/s20-pause-controller.js), so "build complete" can
   * never disagree between the two enforcement points.
   *
   * @param {string} ventureId
   * @returns {Promise<boolean|null>} true = leo_bridge build complete; false = leo_bridge but
   *   incomplete (0 SDs, any non-terminal SD, or all-cancelled); null = NOT a leo_bridge venture
   *   (the invariant does not apply — caller should fall through).
   */
  async _isLeoBridgeBuildComplete(ventureId) {
    const { data: ventureRow } = await this._supabase
      .from('ventures').select('build_model').eq('id', ventureId).maybeSingle();
    const { data: s19Work } = await this._supabase
      .from('venture_stage_work').select('advisory_data')
      .eq('venture_id', ventureId).eq('lifecycle_stage', 19).maybeSingle();
    const { resolveBuildModel } = await import('./bridge/resolve-build-model.js');
    const buildModel = resolveBuildModel({
      ventureBuildModel: ventureRow?.build_model,
      legacyBuildMethod: s19Work?.advisory_data?.build_method,
    });
    if (buildModel !== 'leo_bridge') return null; // invariant applies only to leo_bridge ventures
    // Explicit chairman escape hatch (consistent with the S19 vision gate honoring chairman_override).
    if (s19Work?.advisory_data?.chairman_override === true) return true;
    const { data: sdsRaw } = await this._supabase
      .from('strategic_directives_v2').select('status, metadata').eq('venture_id', ventureId);
    // SD-LEO-INFRA-S19-BRIDGE-UNBLOCK-SCHEMA-DRIFT-001 FR-5: EXCLUDE the human-action venture-tracking
    // SD (metadata.requires_human_action=true) from completeness. It is a perpetually-draft tracker —
    // counting its non-terminal status would keep `allTerminal` false forever and permanently re-block
    // S19/S20 even after the real build SDs complete.
    const sds = (sdsRaw || []).filter((sd) => sd?.metadata?.requires_human_action !== true);
    if (sds.length === 0) return false; // no real build SDs = the build never happened
    const TERMINAL = new Set(['completed', 'cancelled', 'archived']);
    const COMPLETED = new Set(['completed', 'archived']);
    const allTerminal = sds.every((sd) => TERMINAL.has(sd.status));
    const anyCompleted = sds.some((sd) => COMPLETED.has(sd.status));
    return allTerminal && anyCompleted;
  }

  /**
   * SD-LEO-INFRA-VISION-GROUNDED-ACCEPTANCE-001 (FR-2): evaluate the vision-acceptance HOLD for the
   * S19 gate. PURE of side effects (DB reads only — no advance, no stage write, no governance/vision
   * write): reads the session-hosted vision_acceptance_verdict recorded in advisory_data, recomputes
   * buildComplete, and delegates to the pure shouldHoldForVisionAcceptance decision. The caller
   * performs the break-HOLD; this method never advances. Extracted as a thin testable seam.
   * @param {string} ventureId
   * @returns {Promise<{hold: boolean, verdict: object|undefined}>}
   */
  async _evaluateVisionAcceptanceHold(ventureId) {
    const { data: vaWork } = await this._supabase
      .from('venture_stage_work').select('advisory_data')
      .eq('venture_id', ventureId).eq('lifecycle_stage', 19).maybeSingle();
    const verdict = vaWork?.advisory_data?.vision_acceptance_verdict;
    const buildComplete = await this._isLeoBridgeBuildComplete(ventureId);
    const hold = shouldHoldForVisionAcceptance({ verdict, buildComplete, strict: isVisionAcceptanceStrict() });
    return { hold, verdict };
  }

  /**
   * SD-LEO-INFRA-STAGE-VISION-ARTIFACT-001 (FR-2): evaluate the vision-DRIFT HOLD for the S19 gate,
   * INPUT-side (pre-tree). PURE of side effects (DB read only — no advance, no stage write, no
   * governance/vision write): reads the session-hosted vision_drift_verdict recorded in advisory_data
   * and delegates to the pure shouldHoldForVisionDrift decision. Takes NO buildComplete (this fires
   * BEFORE the tree exists — D7). Default fail-OPEN on an absent verdict; NOT_EVALUATED holds only under
   * VISION_DRIFT_STRICT (D1 — the producer is session-only and never runs on the headless worker path).
   * The caller performs the break-HOLD; this method never advances.
   * @param {string} ventureId
   * @returns {Promise<{hold: boolean, cause: string, verdict: object|undefined}>}
   */
  async _evaluateVisionDriftHold(ventureId) {
    const { data: vdWork } = await this._supabase
      .from('venture_stage_work').select('advisory_data')
      .eq('venture_id', ventureId).eq('lifecycle_stage', 19).maybeSingle();
    const verdict = vdWork?.advisory_data?.vision_drift_verdict;
    const { hold, cause } = shouldHoldForVisionDrift({ verdict, enforce: isVisionDriftStrict() });
    return { hold, cause, verdict };
  }

  /**
   * SD-LEO-INFRA-HARDEN-S19-S20-001 (FR-5): emit an audit row for an S19 hard-gate decision.
   * The recurrence (RCA 7610876f) left ZERO audit trail; every block/advance decision must now be
   * observable. system_events has NO event_data column — dual-write the body to BOTH `details`
   * (canonical for venture-lifecycle reads) and `payload` (matches the leo-build-starter emitter).
   * Best-effort + non-fatal: an audit failure must never destabilize the gate it documents.
   * @param {string} ventureId
   * @param {'S19_HARD_GATE_BLOCK'|'S19_HARD_GATE_ADVANCE'} eventType
   * @param {Record<string, any>} body
   */
  async _emitS19HardGateEvent(ventureId, eventType, body = {}) {
    try {
      const payload = { venture_id: ventureId, from_stage: 19, build_model: 'leo_bridge', ...body };
      const stamp = new Date().toISOString();
      await this._supabase.from('system_events').insert({
        event_type: eventType,
        venture_id: ventureId,
        idempotency_key: `${eventType}:${ventureId}:${Date.parse(stamp)}`,
        payload,
        details: payload,
        created_at: stamp,
      });
    } catch (err) {
      this._logger.warn(`[Worker] S19 hard-gate event emit failed (non-fatal): ${err.message}`);
    }
  }

  /**
   * SD-LEO-INFRA-RELIABLE-S19-BUILD-001 / FR-2: write the S19 leo_bridge block row.
   *
   * Upserts venture_stage_work (venture_id, lifecycle_stage:19) → stage_status:'blocked',
   * work_type:'sd_required', advisory_data tagged with reason:'vision_pending' so the
   * dashboard surfaces it AND the gate fast-path can re-block without re-running the bridge.
   *
   * @param {string} ventureId
   * @param {any} bridgeErrors
   */
  async _blockS19LeoBridge(ventureId, bridgeErrors) {
    // SD-LEO-FEAT-SURFACE-S19-VISION-001 (FR-2): discriminate a genuine vision-pending block
    // (no chairman-approved L2 vision) from any other bridge failure, so we only surface the
    // "approve your vision" copy-paste card when it actually applies.
    let visionApproved = false;
    try {
      const { data } = await this._supabase
        .from('eva_vision_documents')
        .select('vision_key')
        .eq('venture_id', ventureId)
        .eq('level', 'L2')
        .eq('status', 'active')
        .eq('chairman_approved', true)
        .limit(1)
        .maybeSingle();
      visionApproved = !!data;
    } catch { /* unreadable → treat as not-approved → surface (fail toward visibility) */ }
    const isVisionPending = !visionApproved;

    // SD-LEO-INFRA-S19-BRIDGE-UNBLOCK-SCHEMA-DRIFT-001 FR-3: derive the block reason from the REAL
    // cause instead of hardcoding 'vision_pending'. A genuine vision-pending block keeps that reason
    // (it drives the "approve your vision" card); an infra/provisioning failure (the bridge threw,
    // e.g. an unapplied-migration 42703) must report honestly so the chairman isn't told to approve a
    // vision that is already approved.
    const errStr = JSON.stringify(bridgeErrors || []);
    const isInfraFailure = /42703|undefined_column|provisioning|stack_descriptor|cannot read|threw/i.test(errStr);
    const blockReason = isVisionPending ? 'vision_pending' : (isInfraFailure ? 'provisioning_failed' : 'bridge_failed');

    // Build the server-authoritative copy-paste commands once; shared by the Stage-19 card
    // (venture_stage_work.advisory_data) and the Decision Deck (chairman_decisions.brief_data).
    let surfacing = null;
    if (isVisionPending) {
      try { surfacing = await this._buildVisionSurfacing(ventureId); }
      catch (err) { this._logger.warn(`[Worker] S19 vision surfacing build failed (non-fatal): ${err.message}`); }
    }

    try {
      await this._supabase.from('venture_stage_work').upsert({
        venture_id: ventureId,
        lifecycle_stage: 19,
        stage_status: 'blocked',
        work_type: 'sd_required',
        advisory_data: {
          build_model: 'leo_bridge',
          bridge_failed: true,
          reason: blockReason,
          bridge_errors: bridgeErrors,
          escalated_at: new Date().toISOString(),
          // FR-2 surfacing payload (server is the single source of truth for the commands).
          vision_pending: isVisionPending,
          ...(surfacing ? {
            vision_status: surfacing.visionStatus,
            draft_seed_vision_key: surfacing.draftSeedVisionKey,
            commands: surfacing.commands,
          } : {}),
        },
      }, { onConflict: 'venture_id,lifecycle_stage' });
    } catch (err) {
      this._logger.warn(`[Worker] S19 leo_bridge block upsert failed (non-fatal): ${err.message}`);
    }

    // FR-2: surface in the chairman Decision Deck (non-destructive create-or-reuse). Only for a
    // genuine vision-pending block — a different bridge failure keeps the blocked row but no card.
    if (isVisionPending && surfacing) {
      await this._createOrReuseVisionDecision(ventureId, surfacing);
    }
  }

  /**
   * SD-LEO-FEAT-SURFACE-S19-VISION-001 (FR-2): build the server-authoritative copy-paste
   * commands + draft_seed vision key for a vision-pending venture. Single source of truth for
   * both venture_stage_work.advisory_data (Stage-19 card) and chairman_decisions.brief_data (Deck).
   *
   * @param {string} ventureId
   * @returns {Promise<{ ventureName: string, draftSeedVisionKey: string|null, visionStatus: string, commands: { brainstorm: string, approve: string } }>}
   */
  async _buildVisionSurfacing(ventureId) {
    const { data: venture } = await this._supabase
      .from('ventures').select('name').eq('id', ventureId).maybeSingle();
    const ventureName = venture?.name || 'this venture';
    // Latest L2 doc (typically the draft_seed stub) — gives the chairman the vision_key context.
    const { data: latestL2 } = await this._supabase
      .from('eva_vision_documents')
      .select('vision_key, status')
      .eq('venture_id', ventureId)
      .eq('level', 'L2')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const commands = {
      brainstorm: `/brainstorm --venture ${ventureName} --seed-from draft_seed`,
      approve: '/eva vision create',
    };
    return {
      ventureName,
      draftSeedVisionKey: latestL2?.vision_key || null,
      visionStatus: latestL2?.status || 'missing',
      commands,
    };
  }

  /**
   * SD-LEO-FEAT-SURFACE-S19-VISION-001 (FR-2): create-or-reuse a PENDING chairman_decisions row
   * (decision_type='vision_approval') so the S19 vision block surfaces in the chairman Decision
   * Deck. NON-DESTRUCTIVE w.r.t. the partial-unique index
   * idx_chairman_decisions_unique_pending(venture_id, lifecycle_stage) WHERE status='pending':
   *   - existing pending vision_approval at (venture,19) → reuse (refresh summary/brief_data)
   *   - a DIFFERENT pending decision occupies the slot    → skip + log (Stage-19 card still surfaces)
   *   - slot free                                         → insert (23505 race → skip + log)
   * All failures are non-fatal (the block itself already succeeded).
   *
   * @param {string} ventureId
   * @param {{ ventureName: string, draftSeedVisionKey: string|null, visionStatus: string, commands: object }} surfacing
   */
  async _createOrReuseVisionDecision(ventureId, surfacing) {
    try {
      const briefData = {
        kind: 'vision_approval',
        venture_name: surfacing.ventureName,
        draft_seed_vision_key: surfacing.draftSeedVisionKey,
        vision_status: surfacing.visionStatus,
        commands: surfacing.commands,
      };
      const summary = `${surfacing.ventureName} — Stage 19 blocked: enrich & approve the L2 vision (run the two Claude Code commands) to generate the build directives.`;

      const { data: existing } = await this._supabase
        .from('chairman_decisions')
        .select('id, decision_type')
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', 19)
        .eq('status', 'pending')
        .limit(1)
        .maybeSingle();

      if (existing) {
        if (existing.decision_type === 'vision_approval') {
          await this._supabase
            .from('chairman_decisions')
            .update({ summary, brief_data: briefData })
            .eq('id', existing.id);
          this._logger.log(`[Worker] S19 vision surfacing: reused pending vision_approval decision ${existing.id} for venture ${ventureId}.`);
        } else {
          this._logger.warn(`[Worker] S19 vision surfacing: a pending '${existing.decision_type}' decision already occupies (venture ${ventureId}, stage 19) — skipping vision_approval Deck row; the Stage-19 card still surfaces the block.`);
        }
        return;
      }

      const { error } = await this._supabase
        .from('chairman_decisions')
        .insert({
          venture_id: ventureId,
          lifecycle_stage: 19,
          status: 'pending',
          decision: 'pending',
          decision_type: 'vision_approval',
          blocking: true,
          summary,
          brief_data: briefData,
        });
      if (error) {
        if (error.code === '23505') {
          this._logger.warn(`[Worker] S19 vision surfacing: pending-decision slot race for venture ${ventureId} (23505) — skipping Deck row.`);
        } else {
          this._logger.warn(`[Worker] S19 vision surfacing: decision insert failed (non-fatal): ${error.message}`);
        }
        return;
      }
      this._logger.log(`[Worker] S19 vision surfacing: created pending vision_approval decision for venture ${ventureId}.`);
    } catch (err) {
      this._logger.warn(`[Worker] S19 vision surfacing failed (non-fatal): ${err.message}`);
    }
  }

  /**
   * SD-LEO-FEAT-SURFACE-S19-VISION-001 (FR-2): resolve a pending vision_approval decision once
   * the S19 vision gate proceeds (vision approved / idempotent / chairman_override) so it leaves
   * the Decision Deck. Idempotent: no-ops when no pending vision_approval row exists. Non-fatal.
   *
   * @param {string} ventureId
   */
  async _resolveVisionPendingDecision(ventureId) {
    try {
      // SD-LEO-INFRA-CHAIRMAN-DECISION-RESOLVE-CANONICAL-001: resolve via the canonical path
      // (fn_chairman_decide) instead of a hand-written UPDATE. Select the pending vision_approval
      // decision id, then call the canonical resolve with p_force_stale=true (fresh autonomous
      // resolve). Idempotent: no-ops when no pending row exists. updated_at is trigger-maintained.
      const { data: _pendingVision } = await this._supabase
        .from('chairman_decisions')
        .select('id')
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', 19)
        .eq('status', 'pending')
        .eq('decision_type', 'vision_approval')
        .limit(1)
        .maybeSingle();
      if (_pendingVision?.id) {
        const { error } = await this._supabase.rpc('fn_chairman_decide', {
          p_decision_id: _pendingVision.id,
          p_action: 'approved',
          p_decided_by: 'auto-proceed-worker-s19-vision',
          p_rationale: 'S19 vision gate proceeded',
          p_force_stale: true,
        });
        if (error) this._logger.warn(`[Worker] S19 vision decision resolve failed (non-fatal): ${error.message}`);
      }
    } catch (err) {
      this._logger.warn(`[Worker] S19 vision decision resolve failed (non-fatal): ${err.message}`);
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
   * Auto-advance eligibility check — delegates to can_auto_advance RPC.
   *
   * SD-LEO-REFAC-GATE-AUTO-ADVANCE-001 FR-2: closes the 4th writer-consumer
   * asymmetry by routing both worker and UI through the same SECURITY DEFINER
   * RPC. Local 4-layer logic was here before this SD; see
   * tests/fixtures/can-auto-advance-pre-refactor.snapshot.js for the frozen
   * pre-refactor implementation that the equivalence test compares against.
   *
   * @param {number} stageNumber
   * @returns {Promise<boolean>}
   */
  async _canAutoAdvance(stageNumber) {
    // SD-LEO-INFRA-RUN-STAGE-ENGINE-GATE-AUTONOMY-001: delegate to the ONE shared predicate so the
    // worker and the engine path can never diverge (divergence was the root of the S10 hard-gate
    // bypass). The shared helper carries this method's exact body — the [SAE] log contract (REG-7) +
    // default-block-on-error behavior are preserved byte-for-byte.
    return canAutoAdvance({ supabase: this._supabase, stageNumber, logger: this._logger });
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
        .eq('lifecycle_stage', stageNumber)
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

      // SD-REFILL-007PVF5E: venture_stage_work has no stage_number column; the real unique
      // constraint is UNIQUE(venture_id, lifecycle_stage). The old onConflict threw Postgres 42P10
      // (no matching constraint) and wrote 0 rows. Map stage_number -> lifecycle_stage.
      await this._supabase
        .from('venture_stage_work')
        .upsert({
          venture_id: ventureId,
          lifecycle_stage: stageNumber,
          advisory_data: advisory,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'venture_id,lifecycle_stage' });

      this._logger.log(`[Worker] Advisory warning recorded for stage ${stageNumber} gate override`);
    } catch (err) {
      this._logger.warn(`[Worker] Failed to record advisory warning: ${err.message}`);
    }
  }

  /**
   * Check if a stage is in the dynamic hard_gate_stages config.
   * Used alongside stage-governance.isBlocking() (kill/promotion from stage_config).
   */
  async _isInHardGateStages(stageNumber) {
    // SD-LEO-INFRA-RUN-STAGE-FAITHFUL-PERSIST-001: delegate to the shared helper
    // (single source of truth shared with run-stage/executeStage).
    return isInHardGateStagesShared(this._supabase, stageNumber);
  }

  async _syncStageWork(ventureId, stageNumber, result) {
    // SD-LEO-INFRA-RUN-STAGE-FAITHFUL-PERSIST-001: delegate to the shared
    // write-through so the daemon and run-stage/executeStage produce identical
    // venture_stage_work records (single source of truth). This method body was
    // extracted verbatim into lib/eva/stage-work-sync.js — see syncStageWork.
    return syncStageWorkShared(this._supabase, { ventureId, stageNumber, result, logger: this._logger });
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

export { OPERATING_MODES, getOperatingMode };

export default StageExecutionWorker;
