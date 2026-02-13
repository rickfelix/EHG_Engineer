/**
 * EVA Master Scheduler - Priority Queue + Cadence Management
 *
 * SD: SD-EVA-FEAT-SCHEDULER-001
 *
 * Long-lived service that polls eva_scheduler_queue, selects ventures
 * by priority ordering, enforces per-venture cadence limits, respects
 * circuit breaker state, and emits orchestration_metrics.
 *
 * @module lib/eva/eva-master-scheduler
 */

import { randomUUID } from 'crypto';
import { processStage } from './eva-orchestrator.js';

// ── Constants ────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_DISPATCH_BATCH_SIZE = 20;
const DEFAULT_MAX_STAGES_PER_CYCLE = 5;
const DEFAULT_STATUS_TOP_N = 10;

// ── EvaMasterScheduler ──────────────────────────────────────

export class EvaMasterScheduler {
  /**
   * @param {Object} deps
   * @param {Object} deps.supabase - Supabase client (service role)
   * @param {Object} [deps.logger] - Logger (defaults to console)
   * @param {Object} [deps.circuitBreaker] - Circuit breaker adapter { getState, recordSuccess, recordFailure }
   * @param {Object} [deps.config] - Configuration overrides
   */
  constructor(deps = {}) {
    this.supabase = deps.supabase;
    this.logger = deps.logger || console;
    this.circuitBreaker = deps.circuitBreaker || null;
    this.instanceId = `scheduler-${randomUUID().slice(0, 8)}`;

    // Configuration (from env vars or overrides)
    const cfg = deps.config || {};
    this.pollIntervalMs = cfg.pollIntervalMs
      || parseInt(process.env.EVA_SCHEDULER_POLL_INTERVAL_SECONDS || '60', 10) * 1000
      || DEFAULT_POLL_INTERVAL_MS;
    this.dispatchBatchSize = cfg.dispatchBatchSize
      || parseInt(process.env.EVA_SCHEDULER_DISPATCH_BATCH_SIZE || '20', 10)
      || DEFAULT_DISPATCH_BATCH_SIZE;
    this.observeOnly = cfg.observeOnly
      ?? (process.env.EVA_SCHEDULER_OBSERVE_ONLY === 'true')
      ?? false;
    this.statusTopN = cfg.statusTopN
      || parseInt(process.env.EVA_SCHEDULER_STATUS_TOP_N || '10', 10)
      || DEFAULT_STATUS_TOP_N;

    // Internal state
    this._timer = null;
    this._running = false;
    this._stopping = false;
    this._pollCount = 0;
    this._totalDispatches = 0;
    this._totalErrors = 0;
    this._metricsWriteFailures = 0;
  }

  // ── Lifecycle ──────────────────────────────────────────────

  /**
   * Start the scheduler polling loop.
   */
  async start() {
    if (this._running) {
      this.logger.warn('[Scheduler] Already running');
      return;
    }

    this._running = true;
    this._stopping = false;
    this.logger.log(`[Scheduler] Starting instance ${this.instanceId}`);
    this.logger.log(`[Scheduler] Poll interval: ${this.pollIntervalMs}ms, Batch size: ${this.dispatchBatchSize}`);
    this.logger.log(`[Scheduler] Observe-only: ${this.observeOnly}`);

    // Register heartbeat
    await this._updateHeartbeat('running');

    // Initial poll immediately, then on interval
    await this._safePoll();
    this._timer = setInterval(() => this._safePoll(), this.pollIntervalMs);

    // Graceful shutdown handlers
    const shutdown = () => this.stop();
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    this._shutdownHandler = shutdown;
  }

  /**
   * Stop the scheduler gracefully.
   */
  async stop() {
    if (!this._running || this._stopping) return;
    this._stopping = true;

    this.logger.log('[Scheduler] Stopping gracefully...');

    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }

    await this._updateHeartbeat('stopped');
    this._running = false;

    if (this._shutdownHandler) {
      process.removeListener('SIGINT', this._shutdownHandler);
      process.removeListener('SIGTERM', this._shutdownHandler);
    }

    this.logger.log(`[Scheduler] Stopped. Polls: ${this._pollCount}, Dispatches: ${this._totalDispatches}, Errors: ${this._totalErrors}`);
  }

  // ── Poll Cycle ─────────────────────────────────────────────

  async _safePoll() {
    try {
      await this.poll();
    } catch (err) {
      this.logger.error(`[Scheduler] Poll error: ${err.message}`);
      this._totalErrors++;
      await this._emitMetric({
        event_type: 'scheduler_error',
        metadata: { error: err.message, stack: err.stack?.slice(0, 500) },
      });
    }
  }

  /**
   * Execute a single poll iteration.
   */
  async poll() {
    if (this._stopping) return;

    const pollStart = Date.now();
    this._pollCount++;

    // 1. Check circuit breaker
    const breakerState = await this._getCircuitBreakerState();
    if (breakerState === 'OPEN') {
      this.logger.log(`[Scheduler] Circuit breaker OPEN - skipping dispatch`);
      await this._emitMetric({
        event_type: 'scheduler_poll',
        queue_depth: await this._getQueueDepth(),
        dispatched_count: 0,
        paused: true,
        pause_reason: 'circuit_breaker_open',
        duration_ms: Date.now() - pollStart,
      });
      await this._emitMetric({
        event_type: 'scheduler_circuit_breaker_pause',
        pause_reason: 'circuit_breaker_open',
      });
      await this._updateHeartbeat('running', { circuit_breaker_state: 'OPEN', paused_reason: 'circuit_breaker_open' });
      return;
    }

    // 2. Select ventures by priority ordering
    const ventures = await this._selectVentures();
    const queueDepth = await this._getQueueDepth();

    if (ventures.length === 0) {
      await this._emitMetric({
        event_type: 'scheduler_poll',
        queue_depth: queueDepth,
        dispatched_count: 0,
        paused: false,
        duration_ms: Date.now() - pollStart,
      });
      await this._updateHeartbeat('running', { circuit_breaker_state: breakerState || 'CLOSED' });
      return;
    }

    // 3. Dispatch ventures with cadence enforcement
    let totalDispatched = 0;
    for (const venture of ventures) {
      if (this._stopping) break;

      const dispatched = await this._dispatchVenture(venture);
      totalDispatched += dispatched;
    }

    this._totalDispatches += totalDispatched;

    // 4. Emit poll metric
    await this._emitMetric({
      event_type: 'scheduler_poll',
      queue_depth: queueDepth,
      dispatched_count: totalDispatched,
      paused: false,
      duration_ms: Date.now() - pollStart,
    });

    await this._updateHeartbeat('running', {
      circuit_breaker_state: breakerState || 'CLOSED',
      paused_reason: null,
    });

    this.logger.log(`[Scheduler] Poll #${this._pollCount}: ${totalDispatched} dispatched from ${ventures.length} ventures (queue: ${queueDepth})`);
  }

  // ── Venture Selection ──────────────────────────────────────

  /**
   * Select ventures from queue using priority ordering.
   * ORDER BY: blocking_decision_age DESC, priority_score DESC, fifo_key ASC
   *
   * Uses FOR UPDATE SKIP LOCKED to prevent double-dispatch
   * across concurrent scheduler instances.
   */
  async _selectVentures() {
    // Join eva_scheduler_queue with evaluation_profiles to get priority_score
    // Note: evaluation_profiles may not have per-venture entries - use default score 0
    const { data, error } = await this.supabase.rpc('select_schedulable_ventures', {
      p_batch_size: this.dispatchBatchSize,
    });

    if (error) {
      // Fallback: direct query without locking RPC
      this.logger.warn(`[Scheduler] RPC unavailable, using direct query: ${error.message}`);
      return this._selectVenturesFallback();
    }

    return data || [];
  }

  async _selectVenturesFallback() {
    const { data, error } = await this.supabase
      .from('eva_scheduler_queue')
      .select(`
        id,
        venture_id,
        blocking_decision_age_seconds,
        fifo_key,
        max_stages_per_cycle,
        status
      `)
      .eq('status', 'pending')
      .order('blocking_decision_age_seconds', { ascending: false, nullsFirst: false })
      .order('fifo_key', { ascending: true })
      .limit(this.dispatchBatchSize);

    if (error) {
      this.logger.error(`[Scheduler] Queue query error: ${error.message}`);
      return [];
    }

    // Check if ventures are actually unblocked
    const results = [];
    for (const entry of (data || [])) {
      const isBlocked = await this._isVentureBlocked(entry.venture_id);
      if (!isBlocked) {
        results.push({
          queue_id: entry.id,
          venture_id: entry.venture_id,
          blocking_decision_age_seconds: entry.blocking_decision_age_seconds,
          priority_score: 0, // Fallback: no priority score available without RPC
          fifo_key: entry.fifo_key,
          max_stages_per_cycle: entry.max_stages_per_cycle || DEFAULT_MAX_STAGES_PER_CYCLE,
        });
      }
    }

    return results;
  }

  // ── Venture Dispatch ───────────────────────────────────────

  /**
   * Dispatch stages for a single venture, respecting cadence limits.
   * Returns number of stages dispatched.
   */
  async _dispatchVenture(venture) {
    const maxStages = venture.max_stages_per_cycle || DEFAULT_MAX_STAGES_PER_CYCLE;
    let dispatched = 0;

    for (let i = 0; i < maxStages; i++) {
      if (this._stopping) break;

      // Re-check blocked status before each dispatch (FR-1 requirement)
      const isBlocked = await this._isVentureBlocked(venture.venture_id);
      if (isBlocked) {
        this.logger.log(`[Scheduler] Venture ${venture.venture_id} became blocked, stopping dispatch`);
        break;
      }

      // Observe-only mode: log but don't dispatch
      if (this.observeOnly) {
        this.logger.log(`[Scheduler] OBSERVE: Would dispatch stage for ${venture.venture_id} (${i + 1}/${maxStages})`);
        dispatched++;
        continue;
      }

      const dispatchStart = Date.now();
      try {
        const result = await processStage(
          { ventureId: venture.venture_id, options: { autoProceed: true } },
          { supabase: this.supabase, logger: this.logger },
        );

        const durationMs = Date.now() - dispatchStart;
        dispatched++;

        // Record success metric
        await this._emitMetric({
          event_type: 'scheduler_dispatch',
          venture_id: venture.venture_id,
          stage_name: result.stageId != null ? `stage_${result.stageId}` : null,
          outcome: result.status === 'COMPLETED' ? 'success' : 'failure',
          failure_reason: result.status !== 'COMPLETED' ? result.errors?.[0]?.message : null,
          duration_ms: durationMs,
        });

        // Signal circuit breaker
        if (result.status === 'COMPLETED') {
          await this._recordCircuitBreakerSuccess();
        } else {
          await this._recordCircuitBreakerFailure(result.errors?.[0]?.message || 'stage failed');
        }

        // Update queue entry
        await this.supabase
          .from('eva_scheduler_queue')
          .update({
            last_dispatched_at: new Date().toISOString(),
            last_dispatch_outcome: result.status === 'COMPLETED' ? 'success' : 'failure',
            dispatch_count: venture.dispatch_count ? venture.dispatch_count + dispatched : dispatched,
          })
          .eq('venture_id', venture.venture_id);

        // Stop if venture is now blocked or failed
        if (result.status === 'BLOCKED' || result.status === 'FAILED') {
          break;
        }
        if (result.filterDecision?.action === 'REQUIRE_REVIEW' || result.filterDecision?.action === 'STOP') {
          break;
        }
      } catch (err) {
        const durationMs = Date.now() - dispatchStart;
        this.logger.error(`[Scheduler] Dispatch error for ${venture.venture_id}: ${err.message}`);
        this._totalErrors++;

        await this._emitMetric({
          event_type: 'scheduler_dispatch',
          venture_id: venture.venture_id,
          outcome: 'failure',
          failure_reason: err.message,
          duration_ms: durationMs,
        });

        await this._recordCircuitBreakerFailure(err.message);

        // Update error count
        await this.supabase
          .from('eva_scheduler_queue')
          .update({
            error_count: (venture.error_count || 0) + 1,
            last_error: err.message,
          })
          .eq('venture_id', venture.venture_id);

        break; // Stop dispatching this venture on error
      }
    }

    // Emit cadence-limited metric if we hit the limit
    if (dispatched >= maxStages) {
      const stillReady = !await this._isVentureBlocked(venture.venture_id);
      if (stillReady) {
        await this._emitMetric({
          event_type: 'scheduler_cadence_limited',
          venture_id: venture.venture_id,
          stages_dispatched: dispatched,
          max_stages_per_cycle: maxStages,
        });
      }
    }

    return dispatched;
  }

  // ── Circuit Breaker Integration ────────────────────────────

  async _getCircuitBreakerState() {
    if (!this.circuitBreaker) return 'CLOSED';
    try {
      return await this.circuitBreaker.getState();
    } catch (err) {
      this.logger.error(`[Scheduler] Circuit breaker error: ${err.message}`);
      // Fail closed: pause dispatch when breaker is unavailable
      return 'OPEN';
    }
  }

  async _recordCircuitBreakerSuccess() {
    if (!this.circuitBreaker) return;
    try {
      await this.circuitBreaker.recordSuccess();
    } catch (err) {
      this.logger.warn(`[Scheduler] CB recordSuccess error: ${err.message}`);
    }
  }

  async _recordCircuitBreakerFailure(reason) {
    if (!this.circuitBreaker) return;
    try {
      await this.circuitBreaker.recordFailure(new Error(reason));
    } catch (err) {
      this.logger.warn(`[Scheduler] CB recordFailure error: ${err.message}`);
    }
  }

  // ── Venture State Checks ───────────────────────────────────

  async _isVentureBlocked(ventureId) {
    const { data, error } = await this.supabase
      .from('eva_ventures')
      .select('orchestrator_state')
      .eq('id', ventureId)
      .single();

    if (error || !data) return true; // Conservative: treat unknown as blocked

    // Blocked if orchestrator state is blocked or failed, or if there's a pending decision
    if (data.orchestrator_state === 'blocked' || data.orchestrator_state === 'failed') {
      return true;
    }

    // Check for pending chairman decisions
    const { data: decisions } = await this.supabase
      .from('eva_decisions')
      .select('id')
      .eq('venture_id', ventureId)
      .eq('status', 'pending')
      .limit(1);

    return decisions && decisions.length > 0;
  }

  // ── Queue Queries ──────────────────────────────────────────

  async _getQueueDepth() {
    const { count, error } = await this.supabase
      .from('eva_scheduler_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (error) return -1;
    return count || 0;
  }

  // ── Metrics (Non-Blocking) ─────────────────────────────────

  /**
   * Emit a metric record to orchestration_metrics.
   * Non-blocking: failures are logged but don't prevent dispatch (TR-4).
   */
  async _emitMetric(fields) {
    try {
      await this.supabase
        .from('eva_scheduler_metrics')
        .insert({
          ...fields,
          scheduler_instance_id: this.instanceId,
          occurred_at: new Date().toISOString(),
        });
    } catch (err) {
      this._metricsWriteFailures++;
      this.logger.warn(`[Scheduler] Metric write failed (${this._metricsWriteFailures} total): ${err.message}`);
    }
  }

  // ── Heartbeat ──────────────────────────────────────────────

  async _updateHeartbeat(status, extra = {}) {
    try {
      await this.supabase
        .from('eva_scheduler_heartbeat')
        .upsert({
          id: 1,
          instance_id: this.instanceId,
          last_poll_at: new Date().toISOString(),
          next_poll_at: new Date(Date.now() + this.pollIntervalMs).toISOString(),
          poll_count: this._pollCount,
          dispatch_count: this._totalDispatches,
          error_count: this._totalErrors,
          status,
          circuit_breaker_state: extra.circuit_breaker_state || 'CLOSED',
          paused_reason: extra.paused_reason || null,
          updated_at: new Date().toISOString(),
          metadata: {
            observe_only: this.observeOnly,
            metrics_write_failures: this._metricsWriteFailures,
          },
        }, { onConflict: 'id' });
    } catch (err) {
      this.logger.warn(`[Scheduler] Heartbeat update failed: ${err.message}`);
    }
  }

  // ── Status Query (Static) ─────────────────────────────────

  /**
   * Get scheduler status for CLI display.
   * Can be called without starting the scheduler.
   */
  static async getStatus(supabase, topN = DEFAULT_STATUS_TOP_N) {
    // 1. Get heartbeat
    const { data: heartbeat } = await supabase
      .from('eva_scheduler_heartbeat')
      .select('*')
      .eq('id', 1)
      .single();

    // 2. Get queue depth
    const { count: queueDepth } = await supabase
      .from('eva_scheduler_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // 3. Get top-N ventures by priority
    const { data: topVentures } = await supabase
      .from('eva_scheduler_queue')
      .select(`
        venture_id,
        blocking_decision_age_seconds,
        fifo_key,
        max_stages_per_cycle,
        dispatch_count,
        last_dispatched_at
      `)
      .eq('status', 'pending')
      .order('blocking_decision_age_seconds', { ascending: false, nullsFirst: false })
      .order('fifo_key', { ascending: true })
      .limit(topN);

    // 4. Compute next_poll_in_seconds
    let nextPollIn = null;
    if (heartbeat?.next_poll_at) {
      nextPollIn = Math.max(0, Math.round((new Date(heartbeat.next_poll_at).getTime() - Date.now()) / 1000));
    }

    return {
      running: heartbeat?.status === 'running',
      instance_id: heartbeat?.instance_id || null,
      started_at: heartbeat?.started_at || null,
      last_poll_at: heartbeat?.last_poll_at || null,
      next_poll_in_seconds: nextPollIn,
      poll_count: heartbeat?.poll_count || 0,
      dispatch_count: heartbeat?.dispatch_count || 0,
      error_count: heartbeat?.error_count || 0,
      circuit_breaker_state: heartbeat?.circuit_breaker_state || 'UNKNOWN',
      paused_reason: heartbeat?.paused_reason || null,
      queue_depth: queueDepth || 0,
      observe_only: heartbeat?.metadata?.observe_only || false,
      top_ventures: (topVentures || []).map(v => ({
        venture_id: v.venture_id,
        blocking_decision_age_seconds: Math.round(v.blocking_decision_age_seconds || 0),
        fifo_key: v.fifo_key,
        max_stages_per_cycle: v.max_stages_per_cycle,
        dispatch_count: v.dispatch_count,
        last_dispatched_at: v.last_dispatched_at,
      })),
    };
  }
}
