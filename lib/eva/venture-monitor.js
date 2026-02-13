/**
 * Event-Driven Venture Monitor
 *
 * Hybrid realtime + cron scheduler for automated venture monitoring.
 * - Supabase Realtime: Detects chairman_decisions approvals, new venture_artifacts
 * - Cron (setInterval): Portfolio health sweep, ops cycle checks, release scheduling
 * - All actions logged to eva_event_log with correlation_id for audit trail
 *
 * SD: SD-EVA-FEAT-EVENT-MONITOR-001
 * Implements: Vision Section 3 (Hybrid Runtime Model)
 */

import { randomUUID } from 'crypto';

const ADVISORY_LOCK_BASE = 0x45564D4F; // "EVMO" in hex

/**
 * @typedef {Object} VentureMonitorConfig
 * @property {number} [healthSweepHourUtc=2] - Hour (UTC) for daily health sweep
 * @property {number} [opsCycleIntervalHours=6] - Hours between ops cycle checks
 * @property {number} [cronPollIntervalMs=60000] - How often cron checks if a job is due
 * @property {number} [maxProcessStageRetries=2] - Max retries for processStage failures
 */

export class VentureMonitor {
  /**
   * @param {Object} params
   * @param {Object} params.supabase - Supabase client
   * @param {Function} params.processStage - processStage function from eva-orchestrator
   * @param {VentureMonitorConfig} [params.config]
   * @param {Object} [params.logger]
   */
  constructor({ supabase, processStage, config = {}, logger = console }) {
    this.supabase = supabase;
    this.processStage = processStage;
    this.logger = logger;
    this.config = {
      healthSweepHourUtc: config.healthSweepHourUtc ?? 2,
      opsCycleIntervalHours: config.opsCycleIntervalHours ?? 6,
      cronPollIntervalMs: config.cronPollIntervalMs ?? 60_000,
      maxProcessStageRetries: config.maxProcessStageRetries ?? 2,
      ...config,
    };

    this.channels = [];
    this.cronTimer = null;
    this.running = false;
    this.processedEvents = new Set();
    this._shutdownRequested = false;
    this._activeJobs = 0;

    // Track last execution times for cron jobs
    this._lastRun = {
      healthSweep: null,
      opsCycle: null,
      releaseScheduling: null,
      nurseryReeval: null,
    };
  }

  /**
   * Start the venture monitor (Realtime subscriptions + cron scheduler).
   */
  async start() {
    if (this.running) return;
    this.running = true;
    this._shutdownRequested = false;
    this.logger.log('[VentureMonitor] Starting...');

    this._subscribeToDecisions();
    this._subscribeToArtifacts();
    this._startCronScheduler();

    this.logger.log('[VentureMonitor] Started successfully');
  }

  /**
   * Gracefully stop the monitor.
   * Waits for active jobs to complete before shutting down.
   */
  async stop() {
    if (!this.running) return;
    this._shutdownRequested = true;
    this.logger.log('[VentureMonitor] Stopping...');

    // Remove realtime channels
    for (const channel of this.channels) {
      this.supabase.removeChannel(channel);
    }
    this.channels = [];

    // Stop cron
    if (this.cronTimer) {
      clearInterval(this.cronTimer);
      this.cronTimer = null;
    }

    // Wait for active jobs (max 30s)
    const deadline = Date.now() + 30_000;
    while (this._activeJobs > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }

    this.running = false;
    this.processedEvents.clear();
    this.logger.log('[VentureMonitor] Stopped');
  }

  // ─── Realtime Subscriptions ────────────────────────────────────

  _subscribeToDecisions() {
    const channel = this.supabase
      .channel('venture-monitor-decisions')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chairman_decisions',
        },
        (payload) => this._handleDecisionChange(payload)
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.logger.log('[VentureMonitor] Subscribed to chairman_decisions');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.logger.warn('[VentureMonitor] chairman_decisions subscription error:', status);
        }
      });

    this.channels.push(channel);
  }

  _subscribeToArtifacts() {
    const channel = this.supabase
      .channel('venture-monitor-artifacts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'venture_artifacts',
        },
        (payload) => this._handleNewArtifact(payload)
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.logger.log('[VentureMonitor] Subscribed to venture_artifacts');
        }
      });

    this.channels.push(channel);
  }

  // ─── Event Handlers ────────────────────────────────────────────

  async _handleDecisionChange(payload) {
    const { new: row, old: oldRow } = payload;
    if (!row || row.status !== 'approved') return;
    if (oldRow && oldRow.status === 'approved') return; // Already approved

    const eventKey = `decision:${row.id}`;
    if (this.processedEvents.has(eventKey)) {
      const correlationId = randomUUID();
      await this._logEvent({
        eventType: 'realtime_trigger',
        triggerSource: 'realtime',
        ventureId: row.venture_id,
        correlationId,
        status: 'suppressed',
        metadata: { reason: 'duplicate', decision_id: row.id },
      });
      return;
    }
    this.processedEvents.add(eventKey);

    const correlationId = randomUUID();
    this.logger.log(`[VentureMonitor] Decision approved: ${row.id} for venture ${row.venture_id}`);

    try {
      this._activeJobs++;
      const result = await this.processStage(
        { ventureId: row.venture_id, options: { parentTraceId: correlationId } },
        { supabase: this.supabase }
      );

      await this._logEvent({
        eventType: 'venture_advancement',
        triggerSource: 'realtime',
        ventureId: row.venture_id,
        correlationId,
        status: 'succeeded',
        metadata: {
          decision_id: row.id,
          stage_id: result?.stageId,
          result_status: result?.status,
        },
      });
    } catch (err) {
      await this._logEvent({
        eventType: 'venture_advancement',
        triggerSource: 'realtime',
        ventureId: row.venture_id,
        correlationId,
        status: 'failed',
        errorMessage: err.message,
        metadata: { decision_id: row.id },
      });
    } finally {
      this._activeJobs--;
    }
  }

  async _handleNewArtifact(payload) {
    const { new: row } = payload;
    if (!row) return;

    const correlationId = randomUUID();
    await this._logEvent({
      eventType: 'artifact_created',
      triggerSource: 'realtime',
      ventureId: row.venture_id,
      correlationId,
      status: 'succeeded',
      metadata: {
        artifact_type: row.artifact_type,
        lifecycle_stage: row.lifecycle_stage,
        title: row.title,
      },
    });
  }

  // ─── Cron Scheduler ────────────────────────────────────────────

  _startCronScheduler() {
    this.cronTimer = setInterval(
      () => this._cronTick(),
      this.config.cronPollIntervalMs
    );
  }

  async _cronTick() {
    if (this._shutdownRequested) return;
    const now = new Date();

    // Daily health sweep (at configured hour UTC)
    if (this._isDue(now, 'healthSweep', 24)) {
      if (now.getUTCHours() === this.config.healthSweepHourUtc) {
        await this._runCronJob('portfolio_health_sweep', () => this._portfolioHealthSweep());
      }
    }

    // Ops cycle check (every N hours)
    if (this._isDue(now, 'opsCycle', this.config.opsCycleIntervalHours)) {
      await this._runCronJob('ops_cycle_check', () => this._opsCycleCheck());
    }

    // Release scheduling (weekly, Monday)
    if (this._isDue(now, 'releaseScheduling', 168) && now.getUTCDay() === 1) {
      await this._runCronJob('release_scheduling', () => this._releaseScheduling());
    }

    // Nursery re-evaluation (weekly, Wednesday)
    if (this._isDue(now, 'nurseryReeval', 168) && now.getUTCDay() === 3) {
      await this._runCronJob('nursery_reevaluation', () => this._nurseryReEvaluation());
    }
  }

  _isDue(now, jobKey, intervalHours) {
    const last = this._lastRun[jobKey];
    if (!last) return true;
    const elapsedMs = now.getTime() - last.getTime();
    return elapsedMs >= intervalHours * 3600_000;
  }

  async _runCronJob(jobName, fn) {
    if (this._shutdownRequested) return;

    const lockId = ADVISORY_LOCK_BASE + this._hashJobName(jobName);
    const correlationId = randomUUID();
    const scheduledTime = new Date();

    // Try to acquire advisory lock
    const locked = await this._acquireAdvisoryLock(lockId);
    if (!locked) {
      await this._logEvent({
        eventType: 'cron_trigger',
        triggerSource: 'cron',
        correlationId,
        status: 'suppressed',
        jobName,
        scheduledTime,
        metadata: { reason: 'lock_contention' },
      });
      return;
    }

    this._activeJobs++;
    try {
      this.logger.log(`[VentureMonitor] Running cron job: ${jobName}`);
      await fn(correlationId);

      // Update last run time
      const jobKey = this._jobNameToKey(jobName);
      if (jobKey) this._lastRun[jobKey] = scheduledTime;

      await this._logEvent({
        eventType: 'cron_trigger',
        triggerSource: 'cron',
        correlationId,
        status: 'succeeded',
        jobName,
        scheduledTime,
      });
    } catch (err) {
      await this._logEvent({
        eventType: 'cron_trigger',
        triggerSource: 'cron',
        correlationId,
        status: 'failed',
        jobName,
        scheduledTime,
        errorMessage: err.message,
      });
    } finally {
      await this._releaseAdvisoryLock(lockId);
      this._activeJobs--;
    }
  }

  // ─── Cron Job Implementations ──────────────────────────────────

  async _portfolioHealthSweep(correlationId) {
    const { data: ventures, error } = await this.supabase
      .from('eva_ventures')
      .select('id, current_stage')
      .eq('status', 'active');

    if (error) throw new Error(`Health sweep query failed: ${error.message}`);
    if (!ventures?.length) return;

    for (const venture of ventures) {
      if (this._shutdownRequested) break;
      try {
        await this.processStage(
          { ventureId: venture.id, options: { parentTraceId: correlationId } },
          { supabase: this.supabase }
        );
        await this._logEvent({
          eventType: 'venture_check',
          triggerSource: 'cron',
          ventureId: venture.id,
          correlationId,
          status: 'succeeded',
          jobName: 'portfolio_health_sweep',
        });
      } catch (err) {
        await this._logEvent({
          eventType: 'venture_check',
          triggerSource: 'cron',
          ventureId: venture.id,
          correlationId,
          status: 'failed',
          jobName: 'portfolio_health_sweep',
          errorMessage: err.message,
        });
      }
    }
  }

  async _opsCycleCheck(correlationId) {
    const { data: ventures, error } = await this.supabase
      .from('eva_ventures')
      .select('id, current_stage')
      .eq('status', 'active')
      .gte('current_stage', 24);

    if (error) throw new Error(`Ops cycle query failed: ${error.message}`);
    if (!ventures?.length) return;

    for (const venture of ventures) {
      if (this._shutdownRequested) break;
      try {
        await this.processStage(
          { ventureId: venture.id, options: { parentTraceId: correlationId } },
          { supabase: this.supabase }
        );
      } catch (err) {
        this.logger.warn(`[VentureMonitor] Ops cycle check failed for ${venture.id}: ${err.message}`);
      }
    }
  }

  async _releaseScheduling(correlationId) {
    const { data: ventures, error } = await this.supabase
      .from('eva_ventures')
      .select('id, current_stage')
      .eq('status', 'active')
      .eq('current_stage', 22);

    if (error) throw new Error(`Release scheduling query failed: ${error.message}`);
    if (!ventures?.length) return;

    for (const venture of ventures) {
      if (this._shutdownRequested) break;
      try {
        await this.processStage(
          { ventureId: venture.id, options: { parentTraceId: correlationId } },
          { supabase: this.supabase }
        );
      } catch (err) {
        this.logger.warn(`[VentureMonitor] Release scheduling failed for ${venture.id}: ${err.message}`);
      }
    }
  }

  async _nurseryReEvaluation(correlationId) {
    const { data: ventures, error } = await this.supabase
      .from('eva_ventures')
      .select('id, current_stage')
      .eq('status', 'active')
      .lte('current_stage', 2);

    if (error) throw new Error(`Nursery re-eval query failed: ${error.message}`);
    if (!ventures?.length) return;

    for (const venture of ventures) {
      if (this._shutdownRequested) break;
      try {
        await this.processStage(
          { ventureId: venture.id, options: { parentTraceId: correlationId } },
          { supabase: this.supabase }
        );
      } catch (err) {
        this.logger.warn(`[VentureMonitor] Nursery re-eval failed for ${venture.id}: ${err.message}`);
      }
    }
  }

  // ─── Advisory Lock ─────────────────────────────────────────────

  async _acquireAdvisoryLock(lockId) {
    try {
      const { data, error } = await this.supabase.rpc('pg_try_advisory_lock', { lock_id: lockId });
      if (error) {
        this.logger.warn(`[VentureMonitor] Advisory lock query failed: ${error.message}`);
        return false;
      }
      return data === true;
    } catch {
      return false;
    }
  }

  async _releaseAdvisoryLock(lockId) {
    try {
      await this.supabase.rpc('pg_advisory_unlock', { lock_id: lockId });
    } catch {
      // Best-effort unlock
    }
  }

  // ─── Event Logging ─────────────────────────────────────────────

  async _logEvent({
    eventType,
    triggerSource,
    ventureId = null,
    correlationId,
    status,
    errorMessage = null,
    jobName = null,
    scheduledTime = null,
    metadata = {},
  }) {
    try {
      await this.supabase.from('eva_event_log').insert({
        event_type: eventType,
        trigger_source: triggerSource,
        venture_id: ventureId,
        correlation_id: correlationId,
        status,
        error_message: errorMessage,
        job_name: jobName,
        scheduled_time: scheduledTime?.toISOString() ?? null,
        metadata,
      });
    } catch (err) {
      this.logger.warn(`[VentureMonitor] Failed to log event: ${err.message}`);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────

  _hashJobName(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 1_000_000;
  }

  _jobNameToKey(jobName) {
    const map = {
      portfolio_health_sweep: 'healthSweep',
      ops_cycle_check: 'opsCycle',
      release_scheduling: 'releaseScheduling',
      nursery_reevaluation: 'nurseryReeval',
    };
    return map[jobName] || null;
  }
}
