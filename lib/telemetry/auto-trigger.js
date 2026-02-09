/**
 * Telemetry Auto-Trigger - Session start integration for bottleneck analysis
 *
 * SD: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001C
 *
 * Checks staleness of last analysis run and enqueues a new run if stale.
 * Designed to be called from session initialization hooks without blocking startup.
 *
 * @module telemetry/auto-trigger
 */

import { randomUUID } from 'crypto';
import { analyzeBottlenecks } from './bottleneck-analyzer.js';

const DEFAULT_STALENESS_DAYS = 7;
const DEFAULT_TIMEOUT_MS = 120000;
const DEDUP_WINDOW_MINUTES = 10;

/**
 * Check if telemetry analysis is stale and needs to run.
 *
 * @param {object} supabase - Supabase client
 * @param {object} [opts={}]
 * @param {string} [opts.scopeType='workspace'] - Scope type
 * @param {string} [opts.scopeId] - Scope identifier
 * @param {number} [opts.stalenessDays] - Override staleness threshold
 * @returns {Promise<{isStale: boolean, lastSuccessAt: string|null, decision: string, durationMs: number}>}
 */
export async function checkStaleness(supabase, opts = {}) {
  const startMs = Date.now();
  const scopeType = opts.scopeType || 'workspace';
  const scopeId = opts.scopeId || process.cwd();
  const stalenessDays = opts.stalenessDays || DEFAULT_STALENESS_DAYS;

  const cutoff = new Date(Date.now() - stalenessDays * 86400000).toISOString();

  const { data, error } = await supabase
    .from('telemetry_analysis_runs')
    .select('finished_at')
    .eq('scope_type', scopeType)
    .eq('status', 'SUCCEEDED')
    .or(`scope_id.eq.${scopeId},scope_id.is.null`)
    .gte('finished_at', cutoff)
    .order('finished_at', { ascending: false })
    .limit(1);

  const durationMs = Date.now() - startMs;

  if (error) {
    return { isStale: true, lastSuccessAt: null, decision: 'stale_query_error', durationMs };
  }

  if (!data || data.length === 0) {
    return { isStale: true, lastSuccessAt: null, decision: 'stale_no_recent_run', durationMs };
  }

  return { isStale: false, lastSuccessAt: data[0].finished_at, decision: 'fresh', durationMs };
}

/**
 * Check if there's already an active (QUEUED/RUNNING) run for this scope.
 *
 * @param {object} supabase
 * @param {object} opts
 * @returns {Promise<{isDuplicate: boolean, existingRunId: string|null}>}
 */
async function checkDuplicate(supabase, opts = {}) {
  const scopeType = opts.scopeType || 'workspace';
  const scopeId = opts.scopeId || process.cwd();
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60000).toISOString();

  const { data } = await supabase
    .from('telemetry_analysis_runs')
    .select('run_id')
    .eq('scope_type', scopeType)
    .in('status', ['QUEUED', 'RUNNING'])
    .or(`scope_id.eq.${scopeId},scope_id.is.null`)
    .gte('triggered_at', cutoff)
    .limit(1);

  if (data && data.length > 0) {
    return { isDuplicate: true, existingRunId: data[0].run_id };
  }
  return { isDuplicate: false, existingRunId: null };
}

/**
 * Enqueue a telemetry analysis run. Creates a tracking record and
 * starts analysis asynchronously (fire-and-forget with timeout).
 *
 * @param {object} supabase
 * @param {object} [opts={}]
 * @param {string} [opts.scopeType='workspace']
 * @param {string} [opts.scopeId]
 * @param {string} [opts.triggeredBy='SESSION_START']
 * @param {string} [opts.correlationId]
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{enqueued: boolean, runId: string|null, decision: string, error: string|null}>}
 */
export async function enqueueAnalysis(supabase, opts = {}) {
  const scopeType = opts.scopeType || 'workspace';
  const scopeId = opts.scopeId || process.cwd();
  const triggeredBy = opts.triggeredBy || 'SESSION_START';
  const correlationId = opts.correlationId || randomUUID();
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const runId = randomUUID();

  // Dedup check
  const { isDuplicate, existingRunId } = await checkDuplicate(supabase, { scopeType, scopeId });
  if (isDuplicate) {
    return { enqueued: false, runId: existingRunId, decision: 'already_queued', error: null };
  }

  // Create tracking record
  const { error: insertError } = await supabase
    .from('telemetry_analysis_runs')
    .insert({
      run_id: runId,
      scope_type: scopeType,
      scope_id: scopeId,
      status: 'QUEUED',
      triggered_by: triggeredBy,
      triggered_at: new Date().toISOString(),
      correlation_id: correlationId,
      metadata: { timeout_ms: timeoutMs },
    });

  if (insertError) {
    return { enqueued: false, runId: null, decision: 'enqueue_failed', error: insertError.message };
  }

  // Fire-and-forget: execute analysis asynchronously with timeout
  executeAnalysisAsync(supabase, runId, timeoutMs).catch(() => {
    // Errors handled inside executeAnalysisAsync
  });

  return { enqueued: true, runId, decision: 'enqueued', error: null };
}

/**
 * Execute the bottleneck analysis with timeout and lifecycle tracking.
 * This runs asynchronously after enqueue.
 */
async function executeAnalysisAsync(supabase, runId, timeoutMs) {
  const startedAt = new Date().toISOString();

  // Mark RUNNING
  await supabase
    .from('telemetry_analysis_runs')
    .update({ status: 'RUNNING', started_at: startedAt })
    .eq('run_id', runId);

  try {
    // Run with timeout
    const result = await Promise.race([
      analyzeBottlenecks(supabase, { runId, enableAutoCreate: true }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
      ),
    ]);

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(startedAt).getTime();

    // Determine reason code
    let reasonCode = null;
    if (result.traces_scanned === 0) {
      reasonCode = 'INSUFFICIENT_DATA';
    }

    await supabase
      .from('telemetry_analysis_runs')
      .update({
        status: 'SUCCEEDED',
        finished_at: finishedAt,
        duration_ms: durationMs,
        findings_count: result.bottlenecks.length,
        top_bottleneck_category: result.bottlenecks[0]?.dimension_type || null,
        reason_code: reasonCode,
        output_ref: {
          bottlenecks: result.bottlenecks,
          traces_scanned: result.traces_scanned,
          dimensions_evaluated: result.dimensions_evaluated,
          items_created: result.items_created,
        },
      })
      .eq('run_id', runId);

    process.stderr.write(
      `[telemetry:auto] Analysis complete: ${result.bottlenecks.length} bottleneck(s), ${result.traces_scanned} traces, ${durationMs}ms\n`
    );
  } catch (err) {
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(startedAt).getTime();
    const isTimeout = err.message === 'TIMEOUT';

    const sanitizedMsg = (err.message || '').replace(/password=[^&\s]+/gi, 'password=***');

    await supabase
      .from('telemetry_analysis_runs')
      .update({
        status: isTimeout ? 'TIMED_OUT' : 'FAILED',
        finished_at: finishedAt,
        duration_ms: durationMs,
        error_class: isTimeout ? 'TimeoutError' : err.constructor?.name || 'Error',
        error_message: sanitizedMsg,
      })
      .eq('run_id', runId);

    process.stderr.write(
      `[telemetry:auto] Analysis ${isTimeout ? 'timed out' : 'failed'}: ${sanitizedMsg}\n`
    );
  }
}

/**
 * Main entry point for session start integration.
 * Checks staleness and enqueues analysis if needed.
 * Designed to be non-blocking and safe (never throws).
 *
 * @param {object} supabase
 * @param {object} [opts={}]
 * @returns {Promise<{decision: string, correlationId: string, durationMs: number}>}
 */
export async function triggerIfStale(supabase, opts = {}) {
  const correlationId = opts.correlationId || randomUUID();
  const startMs = Date.now();

  try {
    // FR-6: Structured log for decision
    const staleness = await checkStaleness(supabase, opts);

    const logEvent = {
      event: 'telemetry_auto_analysis_decision',
      scope: opts.scopeType || 'workspace',
      is_stale: staleness.isStale,
      last_success_at: staleness.lastSuccessAt,
      decision: staleness.decision,
      correlation_id: correlationId,
      duration_ms: staleness.durationMs,
    };

    if (!staleness.isStale) {
      process.stderr.write(`[telemetry:auto] ${JSON.stringify(logEvent)}\n`);
      return { decision: 'skipped_fresh', correlationId, durationMs: Date.now() - startMs };
    }

    // Enqueue analysis
    const enqueueResult = await enqueueAnalysis(supabase, {
      ...opts,
      correlationId,
    });

    logEvent.decision = enqueueResult.decision;
    logEvent.run_id = enqueueResult.runId;
    process.stderr.write(`[telemetry:auto] ${JSON.stringify(logEvent)}\n`);

    if (enqueueResult.error) {
      process.stderr.write(
        `[telemetry:auto] Enqueue failed: ${enqueueResult.error}\n`
      );
    }

    return {
      decision: enqueueResult.decision,
      correlationId,
      durationMs: Date.now() - startMs,
    };
  } catch (err) {
    // FR-4: Never crash the session
    const sanitized = (err.message || '').replace(/password=[^&\s]+/gi, 'password=***');
    process.stderr.write(`[telemetry:auto] Error (non-fatal): ${sanitized}\n`);
    return { decision: 'error_non_fatal', correlationId, durationMs: Date.now() - startMs };
  }
}

/**
 * Get the latest successful analysis findings for sd:next display (FR-5).
 *
 * @param {object} supabase
 * @param {object} [opts={}]
 * @returns {Promise<{hasFreshFindings: boolean, run: object|null, ageInDays: number|null, activeRun: object|null}>}
 */
export async function getLatestFindings(supabase, opts = {}) {
  const scopeType = opts.scopeType || 'workspace';
  const maxAgeDays = opts.maxAgeDays || 30;
  const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();

  // Get latest SUCCEEDED run
  const { data: succeeded } = await supabase
    .from('telemetry_analysis_runs')
    .select('run_id, finished_at, findings_count, top_bottleneck_category, output_ref, reason_code, duration_ms')
    .eq('scope_type', scopeType)
    .eq('status', 'SUCCEEDED')
    .gte('finished_at', cutoff)
    .order('finished_at', { ascending: false })
    .limit(1);

  // Check for active runs
  const { data: active } = await supabase
    .from('telemetry_analysis_runs')
    .select('run_id, status, triggered_at')
    .eq('scope_type', scopeType)
    .in('status', ['QUEUED', 'RUNNING'])
    .order('triggered_at', { ascending: false })
    .limit(1);

  if (!succeeded || succeeded.length === 0) {
    return {
      hasFreshFindings: false,
      run: null,
      ageInDays: null,
      activeRun: active?.[0] || null,
    };
  }

  const run = succeeded[0];
  const ageInDays = Math.round((Date.now() - new Date(run.finished_at).getTime()) / 86400000);

  return {
    hasFreshFindings: true,
    run,
    ageInDays,
    activeRun: active?.[0] || null,
  };
}
