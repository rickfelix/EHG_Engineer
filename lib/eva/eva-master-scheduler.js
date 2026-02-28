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
import { scoreSD } from '../../scripts/eva/vision-scorer.js';
import { syncVisionScoresToPatterns } from '../../scripts/eva/vision-to-patterns.js';
import { runOkrMonthlySnapshot } from './jobs/okr-monthly-handler.js';
import { runOkrMonthlyGeneration } from './jobs/okr-monthly-generator.js';
import { runOkrMidMonthReview } from './jobs/okr-mid-month-review.js';
import { archiveStaleOkrs } from './jobs/okr-archive-stale.js';

// ── Constants ────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_VISION_SCORING_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const VISION_SCORING_LOOKBACK_DAYS = 7;
const VISION_SCORING_BATCH_SIZE = 5;
const DEFAULT_DISPATCH_BATCH_SIZE = 20;
const DEFAULT_MAX_STAGES_PER_CYCLE = 5;
const DEFAULT_STATUS_TOP_N = 10;
const DEFAULT_ROUND_TIMEOUT_MS = 30_000;

const CADENCE_TO_MS = {
  frequent: 600_000,       // 10 minutes
  hourly: 3_600_000,
  daily: 86_400_000,
  weekly: 604_800_000,
  monthly: 2_592_000_000,
};

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

    // Dynamic compute scaling (SD-MAN-ORCH-VISION-HEAL-SCORE-93-001-04-A)
    this.dynamicScalingEnabled = cfg.dynamicScaling ?? (process.env.EVA_DYNAMIC_SCALING !== 'false');
    this._baseBatchSize = this.dispatchBatchSize;
    this._basePollInterval = this.pollIntervalMs;
    this._lastQueueDepth = 0;
    this.observeOnly = cfg.observeOnly
      ?? (process.env.EVA_SCHEDULER_OBSERVE_ONLY === 'true')
      ?? false;
    this.statusTopN = cfg.statusTopN
      || parseInt(process.env.EVA_SCHEDULER_STATUS_TOP_N || '10', 10)
      || DEFAULT_STATUS_TOP_N;

    // Periodic vision scoring configuration (US-001)
    this.visionScoringIntervalMs = cfg.visionScoringIntervalMs || DEFAULT_VISION_SCORING_INTERVAL_MS;

    // Round registry (FR-1, FR-3, FR-4)
    this._roundRegistry = new Map();
    this._lastRoundRun = new Map();
    this._totalRoundExecutions = 0;
    this._totalRoundErrors = 0;

    // Internal state
    this._timer = null;
    this._running = false;
    this._stopping = false;
    this._pollCount = 0;
    this._totalDispatches = 0;
    this._totalErrors = 0;
    this._metricsWriteFailures = 0;
    this._lastVisionScoringAt = null;

    // Job Registry (US-002: pluggable periodic tasks)
    this._jobRegistry = new Map();
    this._jobLastRunAt = new Map();

    // Register built-in jobs
    this._registerBuiltinJobs();

    // Register default rounds (FR-3)
    this._registerDefaultRounds();
    this._registerSensemakingMonitor();
    // Register notification rounds (FR-4)
    this._registerNotificationRounds();
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

    // US-003: Catch-up — run overdue jobs on startup
    await this._runDueJobs();

    // Initial poll immediately, then on adaptive interval
    await this._safePoll();
    this._startAdaptivePolling();

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

  // ── Round Registry (FR-1) ─────────────────────────────────

  /**
   * Register a round type with its handler.
   * @param {string} roundType - Unique round type name (e.g., 'vision_rescore')
   * @param {Object} config
   * @param {string} config.description - Human-readable description
   * @param {Function} config.handler - async function(options) => result
   * @param {string} [config.cadence] - Cadence: 'hourly', 'daily', 'weekly', 'monthly', 'on_demand'
   */
  registerRound(roundType, config) {
    if (!roundType || !config?.handler) {
      throw new Error('roundType and config.handler are required');
    }
    this._roundRegistry.set(roundType, {
      type: roundType,
      description: config.description || '',
      handler: config.handler,
      cadence: config.cadence || 'on_demand',
      registeredAt: new Date().toISOString(),
    });
  }

  /**
   * Execute a registered round by type.
   * @param {string} roundType
   * @param {Object} [options]
   * @returns {Promise<Object>} Execution result with timing
   */
  async runRound(roundType, options = {}) {
    const round = this._roundRegistry.get(roundType);
    if (!round) {
      throw new Error(`Round type '${roundType}' not registered. Available: ${this.listRounds().map(r => r.type).join(', ')}`);
    }

    const startTime = Date.now();
    this.logger.log(`[Scheduler] Round: ${roundType} - ${round.description}`);

    try {
      const result = await Promise.race([
        round.handler(options),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Round timeout')), DEFAULT_ROUND_TIMEOUT_MS)
        ),
      ]);
      const latencyMs = Date.now() - startTime;
      this._totalRoundExecutions++;
      this._lastRoundRun.set(roundType, Date.now());

      await this._emitMetric({
        event_type: 'scheduler_round',
        metadata: { round_type: roundType, outcome: 'success', latency_ms: latencyMs },
      });

      return { roundType, success: true, result, latencyMs, executedAt: new Date().toISOString() };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      this._totalRoundErrors++;
      this.logger.error(`[Scheduler] Round ${roundType} failed after ${latencyMs}ms: ${err.message}`);

      await this._recordCircuitBreakerFailure(`round:${roundType}: ${err.message}`);
      await this._emitMetric({
        event_type: 'scheduler_round',
        metadata: { round_type: roundType, outcome: 'failure', error: err.message, latency_ms: latencyMs },
      });

      return { roundType, success: false, error: err.message, latencyMs, executedAt: new Date().toISOString() };
    }
  }

  /**
   * List all registered rounds.
   * @returns {Array<Object>}
   */
  listRounds() {
    return Array.from(this._roundRegistry.values()).map(r => ({
      type: r.type,
      description: r.description,
      cadence: r.cadence,
      registeredAt: r.registeredAt,
    }));
  }

  /**
   * Execute all rounds whose cadence interval has elapsed (FR-2).
   * Called at the end of each poll() cycle.
   */
  async _executeScheduledRounds() {
    const breakerState = await this._getCircuitBreakerState();
    if (breakerState === 'OPEN') {
      this.logger.log('[Scheduler] Circuit breaker OPEN - skipping rounds');
      return;
    }

    for (const [type, round] of this._roundRegistry) {
      if (this._stopping) break;

      const cadenceMs = CADENCE_TO_MS[round.cadence];
      if (!cadenceMs) continue; // on_demand rounds skip automatic execution

      const lastRun = this._lastRoundRun.get(type) || 0;
      if (Date.now() - lastRun < cadenceMs) continue;

      if (this.observeOnly) {
        this.logger.log(`[Scheduler] OBSERVE: Would run round ${type}`);
        this._lastRoundRun.set(type, Date.now());
        continue;
      }

      await this.runRound(type);
    }
  }

  /**
   * Register the 4 default EVA rounds (FR-3).
   */
  _registerDefaultRounds() {
    this.registerRound('vision_rescore', {
      description: 'Rescore portfolio vision alignment via inline Claude Code evaluation',
      cadence: 'weekly',
      handler: async () => {
        const { createVisionGovernanceService } = await import('./vision-governance-service.js');
        const service = createVisionGovernanceService();
        const latest = await service.getLatestScore();
        return {
          action: 'rescore_needed',
          lastScore: latest?.total_score || null,
          lastScoredAt: latest?.scored_at || null,
          instruction: 'Run: node scripts/eva/vision-heal.js score',
        };
      },
    });

    this.registerRound('gap_analysis', {
      description: 'Analyze open vision gaps and check for corrective SD progress',
      cadence: 'weekly',
      handler: async () => {
        const { createVisionGovernanceService } = await import('./vision-governance-service.js');
        const service = createVisionGovernanceService();
        const [gaps, correctives] = await Promise.all([
          service.getGaps(),
          service.getActiveCorrectiveSDs(),
        ]);
        return {
          openGaps: gaps.length,
          activeCorrectiveSDs: correctives.length,
          gaps: gaps.slice(0, 5),
          correctives: correctives.slice(0, 5),
        };
      },
    });

    this.registerRound('stage_health', {
      description: 'Check stage template completeness across all 25 lifecycle stages',
      cadence: 'monthly',
      handler: async () => {
        const { readdirSync } = await import('fs');
        const { join, dirname } = await import('path');
        const { fileURLToPath } = await import('url');
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const templatesDir = join(__dirname, 'stage-templates');

        const files = readdirSync(templatesDir).filter(f => f.match(/^stage-\d{2}\.js$/));
        const found = files.map(f => parseInt(f.match(/stage-(\d{2})/)[1]));
        const missing = [];
        for (let i = 1; i <= 25; i++) {
          if (!found.includes(i)) missing.push(i);
        }
        return { totalStages: 25, templatesFound: found.length, templatesMissing: missing.length, found: found.sort((a, b) => a - b), missing };
      },
    });

    this.registerRound('corrective_generation', {
      description: 'Generate corrective SDs from latest vision score gaps',
      cadence: 'weekly',
      handler: async () => {
        const { createVisionGovernanceService } = await import('./vision-governance-service.js');
        const service = createVisionGovernanceService();
        const latest = await service.getLatestScore();
        if (!latest) return { action: 'no_scores', message: 'No vision scores found. Run eva:heal score first.' };
        if (latest.threshold_action === 'accept') return { action: 'accept', score: latest.total_score, message: 'All dimensions pass. No correctives needed.' };
        const result = await service.generateCorrectiveSDs(latest.id);
        return { action: result.created ? 'created' : 'deferred', scoreId: latest.id, totalScore: latest.total_score, ...result };
      },
    });
  }

  /**
   * Register notification digest/summary as rounds (FR-4).
   */
  _registerNotificationRounds() {
    const supabase = this.supabase;

    this.registerRound('daily_digest', {
      description: 'Send daily digest notifications to chairmen',
      cadence: 'daily',
      handler: async () => {
        const { runDailyDigestScheduler } = await import('../notifications/scheduler.js');
        return runDailyDigestScheduler(supabase);
      },
    });

    this.registerRound('weekly_summary', {
      description: 'Send weekly summary notifications to chairmen',
      cadence: 'weekly',
      handler: async () => {
        const { runWeeklySummaryScheduler } = await import('../notifications/scheduler.js');
        return runWeeklySummaryScheduler(supabase);
      },
    });
  }

  /**
   * Register sensemaking disposition monitor round (FR-005).
   * Polls for new keep-dispositioned sensemaking analyses every 10 minutes.
   * Uses disposition_at cursor for incremental processing.
   * Auto-triggers assist processing via Telegram notification when new items found.
   */
  _registerSensemakingMonitor() {
    const supabase = this.supabase;
    let highWaterMark = null; // disposition_at cursor

    this.registerRound('sensemaking_disposition_monitor', {
      description: 'Poll for new sensemaking keep-dispositions and auto-trigger assist',
      cadence: 'frequent',
      handler: async () => {
        let query = supabase
          .from('sensemaking_analyses')
          .select('id, correlation_id, disposition, disposition_at, input_source')
          .eq('disposition', 'keep')
          .order('disposition_at', { ascending: true })
          .limit(50);

        if (highWaterMark) {
          query = query.gt('disposition_at', highWaterMark);
        }

        const { data, error } = await query;
        if (error) throw new Error(`Sensemaking monitor query failed: ${error.message}`);

        const items = data || [];
        if (items.length > 0) {
          // Advance cursor to latest disposition_at
          highWaterMark = items[items.length - 1].disposition_at;

          for (const item of items) {
            this.logger.log(`[sensemaking-monitor] Surfaced keep-disposition: ${item.correlation_id} (source: ${item.input_source})`);
          }

          // Auto-trigger: notify via Telegram and flag for assist processing
          await this._notifyAssistTrigger(supabase, items);
        }

        return {
          newKeepItems: items.length,
          highWaterMark,
          items: items.map(i => ({ id: i.id, correlationId: i.correlation_id, source: i.input_source })),
        };
      },
    });
  }

  /**
   * Auto-process new sensemaking items: create SDs from linked feedback
   * and notify chairman via Telegram.
   */
  async _notifyAssistTrigger(supabase, keepItems) {
    try {
      // 1. Find feedback items linked to these sensemaking analyses
      const correlationIds = keepItems.map(i => i.correlation_id).filter(Boolean);
      if (correlationIds.length === 0) return;

      const { data: feedbackRows } = await supabase
        .from('feedback')
        .select('id, title, description, type, priority, strategic_directive_id, resolution_sd_id, metadata')
        .in('metadata->>sensemaking_correlation_id', correlationIds)
        .is('strategic_directive_id', null)
        .is('resolution_sd_id', null);

      const actionable = feedbackRows || [];
      if (actionable.length === 0) {
        this.logger.log('[sensemaking-monitor] No unlinked feedback items to process');
        return;
      }

      // 2. Auto-create SDs from each feedback item
      const created = [];
      for (const fb of actionable) {
        try {
          const sd = await this._createSDFromFeedback(supabase, fb);
          if (sd) created.push({ feedbackId: fb.id, sdKey: sd.sd_key, title: fb.title });
        } catch (err) {
          this.logger.error(`[sensemaking-monitor] Failed to create SD for feedback ${fb.id}: ${err.message}`);
        }
      }

      // 3. Send Telegram notification with results
      if (created.length > 0) {
        const { sendTelegramMessage } = await import('../notifications/telegram-adapter.js');
        const summary = created.map(c => `  - ${c.sdKey}: ${c.title}`).join('\n');
        await sendTelegramMessage({
          text: `🤖 Auto-Assist: ${created.length} SD(s) created\n\n${summary}\n\nQueued for next leo:continuous run.`,
        });
        this.logger.log(`[sensemaking-monitor] Auto-created ${created.length} SD(s) from sensemaking items`);
      }
    } catch (err) {
      // Non-blocking: log but don't fail the monitor round
      this.logger.error(`[sensemaking-monitor] Auto-trigger failed: ${err.message}`);
    }
  }

  /**
   * Create an SD from a feedback item (headless version of createFromFeedback).
   */
  async _createSDFromFeedback(supabase, feedback) {
    const { runTriageGate } = await import('../../scripts/modules/triage-gate.js');
    const { generateSDKey } = await import('../../scripts/modules/sd-key-generator.js');
    const { createSD } = await import('../../scripts/leo-create-sd.js');

    // Enrich from sensemaking analysis when available (persona-driven title/description)
    let title = feedback.title;
    let description = feedback.description || feedback.title;
    let effectiveType = feedback.type;
    const correlationId = feedback.metadata?.sensemaking_correlation_id;
    if (correlationId) {
      try {
        const { data: sa } = await supabase
          .from('sensemaking_analyses')
          .select('disposition, analysis_result')
          .eq('correlation_id', correlationId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (sa?.analysis_result) {
          const r = sa.analysis_result;
          if (r.summary) title = r.summary.slice(0, 200);
          // Build description from persona insights
          const personas = r.persona_insights || [];
          if (personas.length > 0) {
            const personaLines = personas.map(p =>
              `**${p.persona_name || p.persona || p.name}**: ${p.key_takeaway || p.implications?.[0] || ''}`
            ).join('\n');
            description = `${r.summary || ''}\n\nPersona Insights:\n${personaLines}`;
            if (r.next_steps?.length) {
              description += '\n\nNext Steps:\n' + r.next_steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
            }
          } else if (r.summary) {
            description = r.summary;
          }
          // keep-dispositioned sensemaking items are enhancements, not issues
          if (sa.disposition === 'keep') effectiveType = 'enhancement';
        }
      } catch { /* non-fatal — fall back to feedback fields */ }
    }

    // Map feedback type to SD type
    const typeMap = { issue: 'fix', enhancement: 'feature', bug: 'fix' };
    const type = typeMap[effectiveType] || 'feature';

    // Triage: if tiny, still create SD (autonomous mode processes everything)
    let tier = 3;
    try {
      const triage = await runTriageGate({
        title,
        description,
        type,
        source: 'sensemaking-monitor'
      }, supabase);
      tier = triage.tier;
    } catch { /* non-fatal */ }

    // Generate SD key
    const sdKey = await generateSDKey({
      source: 'FEEDBACK',
      type,
      title,
      venturePrefix: 'LEO',
      skipLeadValidation: true  // headless — no interactive session
    });

    // Create SD
    const sd = await createSD({
      sdKey,
      title,
      description,
      type,
      priority: feedback.priority === 'P0' ? 'critical' : feedback.priority === 'P1' ? 'high' : 'medium',
      rationale: 'Auto-created from sensemaking-enriched feedback. Source: telegram/sensemaking',
      metadata: {
        source: 'sensemaking-monitor',
        source_id: feedback.id,
        feedback_type: feedback.type,
        feedback_priority: feedback.priority,
        triage_tier: tier,
        auto_created: true,
        sensemaking_enriched: !!correlationId
      }
    });

    // Link feedback to SD
    await supabase
      .from('feedback')
      .update({ status: 'in_progress', strategic_directive_id: sd.id })
      .eq('id', feedback.id);

    this.logger.log(`[sensemaking-monitor] Created ${sdKey} from feedback ${feedback.id} (tier ${tier})`);
    return sd;
  }

  // ── Dynamic Compute Scaling (SD-MAN-ORCH-VISION-HEAL-SCORE-93-001-04-A) ──

  /**
   * Start adaptive polling that adjusts interval based on queue depth.
   * Replaces static setInterval with dynamic scheduling.
   */
  _startAdaptivePolling() {
    const scheduleNext = () => {
      if (this._stopping) return;
      const interval = this.dynamicScalingEnabled
        ? this._computeAdaptiveInterval()
        : this.pollIntervalMs;
      this._timer = setTimeout(async () => {
        await this._safePoll();
        scheduleNext();
      }, interval);
    };
    scheduleNext();
  }

  /**
   * Compute adaptive poll interval and batch size based on queue pressure.
   * High queue depth → shorter intervals, larger batches (up to 2x base).
   * Empty queue → longer intervals (up to 3x base) to save compute.
   */
  _computeAdaptiveInterval() {
    const depth = this._lastQueueDepth;

    if (depth === 0) {
      // Nothing to process — slow down
      this.dispatchBatchSize = this._baseBatchSize;
      return Math.min(this._basePollInterval * 3, 300_000); // max 5 minutes
    } else if (depth > this._baseBatchSize * 2) {
      // Heavy load — speed up and increase batch
      this.dispatchBatchSize = Math.min(this._baseBatchSize * 2, 50);
      return Math.max(this._basePollInterval / 2, 10_000); // min 10 seconds
    } else if (depth > this._baseBatchSize) {
      // Moderate load — slight speedup
      this.dispatchBatchSize = Math.min(this._baseBatchSize + 5, 40);
      return Math.max(this._basePollInterval * 0.75, 15_000);
    }

    // Normal load
    this.dispatchBatchSize = this._baseBatchSize;
    return this._basePollInterval;
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
      this.logger.log('[Scheduler] Circuit breaker OPEN - skipping dispatch');
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
    this._lastQueueDepth = queueDepth; // Feed dynamic scaling

    if (ventures.length === 0) {
      await this._emitMetric({
        event_type: 'scheduler_poll',
        queue_depth: queueDepth,
        dispatched_count: 0,
        paused: false,
        duration_ms: Date.now() - pollStart,
      });
      await this._updateHeartbeat('running', { circuit_breaker_state: breakerState || 'CLOSED' });
      // Still run scheduled rounds even with no ventures (FR-2)
      await this._executeScheduledRounds();
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

    // Run periodic vision scoring (daily cadence, feature-flag gated — US-001)
    await this.runPeriodicVisionScoring();

    // Run due jobs from registry (US-002: pluggable periodic tasks)
    await this._runDueJobs();

    // Execute scheduled rounds (FR-2)
    await this._executeScheduledRounds();
  }

  // ── Periodic Vision Scoring ────────────────────────────────

  /**
   * Score top 5 recently-completed SDs for vision alignment on a daily cadence.
   * Controlled by VISION_PERIODIC_SCORING_ENABLED env var (US-001).
   * After scoring, triggers vision-to-patterns sync and optionally process-gap-reporter.
   *
   * @returns {Promise<void>}
   */
  async runPeriodicVisionScoring() {
    if (process.env.VISION_PERIODIC_SCORING_ENABLED !== 'true') return;

    const now = Date.now();
    if (this._lastVisionScoringAt && (now - this._lastVisionScoringAt) < this.visionScoringIntervalMs) return;
    this._lastVisionScoringAt = now;

    this.logger.log('[Scheduler] Starting periodic vision scoring...');

    // US-002: Query top 5 SDs completed in the last 7 days
    const since = new Date(now - VISION_SCORING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: sds, error } = await this.supabase
      .from('strategic_directives_v2')
      .select('sd_key, title')
      .eq('status', 'completed')
      .gte('updated_at', since)
      .order('updated_at', { ascending: false })
      .limit(VISION_SCORING_BATCH_SIZE);

    if (error) {
      this.logger.error(`[Scheduler] Vision scoring query error: ${error.message}`);
      return;
    }

    if (!sds || sds.length === 0) {
      this.logger.log('[Scheduler] No recently-completed SDs to score');
      return;
    }

    // US-002: Score each SD; failures are isolated (per-SD try/catch)
    let scoredCount = 0;
    for (const sd of sds) {
      try {
        await scoreSD({ sdKey: sd.sd_key, supabase: this.supabase });
        scoredCount++;
        this.logger.log(`[Scheduler] Vision scored: ${sd.sd_key}`);
      } catch (err) {
        this.logger.error(`[Scheduler] Vision scoring failed for ${sd.sd_key}: ${err.message}`);
      }
    }

    if (scoredCount === 0) {
      this.logger.log('[Scheduler] Periodic vision scoring: 0 scored, skipping downstream triggers');
      return;
    }

    // US-003: Trigger vision-to-patterns sync after batch completes
    try {
      await syncVisionScoresToPatterns(this.supabase);
      this.logger.log('[Scheduler] Vision-to-patterns sync complete');
    } catch (err) {
      this.logger.error(`[Scheduler] Vision-to-patterns sync failed: ${err.message}`);
    }

    // US-004: Conditionally trigger process-gap-reporter.mjs (if it exists)
    await this._runProcessGapReporter();

    this.logger.log(`[Scheduler] Periodic vision scoring complete (${scoredCount}/${sds.length} scored)`);
  }

  /**
   * Attempt to invoke process-gap-reporter.mjs if it exists.
   * Silently skips if the module is not found (US-004).
   *
   * @returns {Promise<void>}
   */
  async _runProcessGapReporter() {
    try {
      const reporterUrl = new URL('../../scripts/eva/process-gap-reporter.mjs', import.meta.url);
      const { syncProcessGaps } = await import(reporterUrl.href);
      await syncProcessGaps(this.supabase);
      this.logger.log('[Scheduler] Process-gap-reporter sync complete');
    } catch (err) {
      if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
        this.logger.log('[Scheduler] process-gap-reporter.mjs not found, skipping');
      } else {
        this.logger.error(`[Scheduler] Process-gap-reporter failed: ${err.message}`);
      }
    }
  }

  // ── Job Registry (US-002) ─────────────────────────────────

  /**
   * Register built-in periodic jobs.
   * Called once during construction.
   */
  _registerBuiltinJobs() {
    // US-003: OKR Monthly Snapshot — 30-day cadence (Day 28-30)
    this.registerJob({
      name: 'okr-monthly-snapshot',
      handler: async () => {
        return runOkrMonthlySnapshot({ supabase: this.supabase, logger: this.logger });
      },
      cadenceDays: 30,
      enabled: process.env.OKR_MONTHLY_SNAPSHOT_ENABLED !== 'false', // enabled by default
    });

    // SD-EHG-ORCH-GOVERNANCE-STACK-001-D: OKR Monthly Generation — Day 1
    this.registerJob({
      name: 'okr-monthly-generate',
      handler: async () => {
        // Archive stale OKRs before generating new ones
        await archiveStaleOkrs({ supabase: this.supabase, logger: this.logger });
        return runOkrMonthlyGeneration({ supabase: this.supabase, logger: this.logger });
      },
      cadenceDays: 30,
      enabled: process.env.OKR_MONTHLY_GENERATE_ENABLED !== 'false',
    });

    // SD-EHG-ORCH-GOVERNANCE-STACK-001-D: OKR Mid-Month Review — Day 15
    this.registerJob({
      name: 'okr-mid-month-review',
      handler: async () => {
        return runOkrMidMonthReview({ supabase: this.supabase, logger: this.logger });
      },
      cadenceDays: 15,
      enabled: process.env.OKR_MID_MONTH_REVIEW_ENABLED !== 'false',
    });
  }

  /**
   * Register a periodic job in the registry.
   *
   * @param {Object} job
   * @param {string} job.name       - Unique job identifier
   * @param {Function} job.handler  - Async function to execute
   * @param {number} job.cadenceDays - Minimum days between executions
   * @param {boolean} [job.enabled=true] - Whether the job is active
   */
  registerJob({ name, handler, cadenceDays, enabled = true }) {
    this._jobRegistry.set(name, { name, handler, cadenceDays, enabled });
  }

  /**
   * Get all registered jobs for observability.
   * @returns {Array<{name: string, cadenceDays: number, enabled: boolean, lastRunAt: string|null}>}
   */
  getRegisteredJobs() {
    const jobs = [];
    for (const [name, job] of this._jobRegistry) {
      jobs.push({
        name,
        cadenceDays: job.cadenceDays,
        enabled: job.enabled,
        lastRunAt: this._jobLastRunAt.get(name) || null,
      });
    }
    return jobs;
  }

  /**
   * Run all due jobs from the registry.
   * Called at the end of each poll cycle.
   * Catch-up logic: if a job hasn't run in > cadenceDays, it fires immediately.
   */
  async _runDueJobs() {
    const now = Date.now();

    for (const [name, job] of this._jobRegistry) {
      if (!job.enabled || this._stopping) continue;

      const lastRun = this._jobLastRunAt.get(name);
      const cadenceMs = job.cadenceDays * 24 * 60 * 60 * 1000;

      if (lastRun && (now - lastRun) < cadenceMs) continue;

      this.logger.log(`[Scheduler] Running job: ${name} (cadence: ${job.cadenceDays}d)`);

      try {
        await job.handler();
        this._jobLastRunAt.set(name, now);

        await this._emitMetric({
          event_type: 'scheduler_job_completed',
          metadata: { job_name: name, cadence_days: job.cadenceDays },
        });

        this.logger.log(`[Scheduler] Job completed: ${name}`);
      } catch (err) {
        this.logger.error(`[Scheduler] Job failed: ${name}: ${err.message}`);
        this._totalErrors++;

        await this._emitMetric({
          event_type: 'scheduler_job_failed',
          metadata: { job_name: name, error: err.message },
        });
      }
    }
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
            round_execution_count: this._totalRoundExecutions,
            round_error_count: this._totalRoundErrors,
            registered_rounds: this.listRounds().map(r => r.type),
            // EVA state persistence checkpoint (SD-MAN-ORCH-VISION-HEAL-SCORE-93-001-05-B)
            dynamic_scaling: {
              enabled: this.dynamicScalingEnabled,
              current_batch_size: this.dispatchBatchSize,
              base_batch_size: this._baseBatchSize,
              last_queue_depth: this._lastQueueDepth,
            },
            last_round_runs: Object.fromEntries(this._lastRoundRun),
            job_last_runs: Object.fromEntries(this._jobLastRunAt),
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
      round_execution_count: heartbeat?.metadata?.round_execution_count || 0,
      round_error_count: heartbeat?.metadata?.round_error_count || 0,
      registered_rounds: heartbeat?.metadata?.registered_rounds || [],
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
