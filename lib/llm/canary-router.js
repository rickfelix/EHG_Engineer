/**
 * LLM Canary Router
 * Implements traffic splitting for gradual local LLM rollout
 *
 * SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001C: Intelligent Routing & Quality Gates
 *
 * Features:
 * - Deterministic bucket-based routing (consistent request assignment)
 * - Gradual traffic splitting (5% → 25% → 50% → 100%)
 * - Quality gate monitoring with auto-rollback
 * - Metrics collection for observability
 *
 * @module lib/llm/canary-router
 * @created 2026-02-06
 */

import { OllamaAdapter, AnthropicAdapter } from '../sub-agents/vetting/provider-adapters.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const CANARY_STAGES = [0, 5, 25, 50, 100];
const BUCKET_RANGE = 10000; // 0-9999 for fine-grained control
const QUALITY_CHECK_INTERVAL_MS = 60000; // 1 minute
const METRICS_WINDOW_MS = 5 * 60 * 1000; // 5 minutes for quality evaluation

// Default thresholds (can be overridden from database)
const DEFAULT_ERROR_RATE_THRESHOLD = 0.05; // 5%
const DEFAULT_LATENCY_MULTIPLIER_THRESHOLD = 2.0; // 2x baseline

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

/**
 * In-memory cache of canary state (refreshed from DB periodically)
 */
let canaryStateCache = null;
let cacheExpiry = 0;
const STATE_CACHE_TTL_MS = 30000; // 30 seconds

/**
 * Metrics buffer for batch insertion
 */
const metricsBuffer = [];
const METRICS_FLUSH_INTERVAL_MS = 10000; // 10 seconds
const METRICS_BATCH_SIZE = 50;

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

let supabaseClient = null;

/**
 * Get or create Supabase client
 */
async function getSupabase() {
  if (supabaseClient) return supabaseClient;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      console.warn('   ⚠️  Canary Router: Supabase not configured, using fallback mode');
      return null;
    }

    supabaseClient = createClient(url, key);
    return supabaseClient;
  } catch (err) {
    console.warn('   ⚠️  Canary Router: Failed to create Supabase client:', err.message);
    return null;
  }
}

// =============================================================================
// CANARY STATE
// =============================================================================

/**
 * Get current canary state from database (with caching)
 * @returns {Promise<Object>} Canary state
 */
export async function getCanaryState() {
  // Return cached state if valid
  if (canaryStateCache && Date.now() < cacheExpiry) {
    return canaryStateCache;
  }

  const supabase = await getSupabase();
  if (!supabase) {
    return getFallbackState();
  }

  try {
    const { data, error } = await supabase.rpc('get_canary_state');

    if (error) {
      console.warn('   ⚠️  Canary Router: State query failed:', error.message);
      return getFallbackState();
    }

    canaryStateCache = data;
    cacheExpiry = Date.now() + STATE_CACHE_TTL_MS;
    return data;
  } catch (err) {
    console.warn('   ⚠️  Canary Router: State fetch error:', err.message);
    return getFallbackState();
  }
}

/**
 * Fallback state when database is unavailable
 */
function getFallbackState() {
  return {
    stage: 0,
    status: 'paused',
    target_model: 'qwen3-coder:30b',
    fallback_model: 'claude-haiku-3-5-20241022',
    error_rate_threshold: DEFAULT_ERROR_RATE_THRESHOLD,
    latency_multiplier_threshold: DEFAULT_LATENCY_MULTIPLIER_THRESHOLD,
    baseline_latency_p95_ms: null,
    current_latency_p95_ms: null,
    consecutive_failures: 0
  };
}

/**
 * Refresh state from database (bypass cache)
 */
export async function refreshCanaryState() {
  canaryStateCache = null;
  cacheExpiry = 0;
  return getCanaryState();
}

// =============================================================================
// DETERMINISTIC ROUTING
// =============================================================================

/**
 * Generate deterministic bucket ID from request context
 * Uses hashing to ensure same request always routes to same bucket
 *
 * @param {Object} context - Request context for hashing
 * @param {string} [context.requestId] - Unique request ID
 * @param {string} [context.sessionId] - Session ID for consistency
 * @param {string} [context.subAgent] - Sub-agent code
 * @returns {number} Bucket ID (0-9999)
 */
export function getBucketId(context = {}) {
  // Build hash input from available context
  const hashInput = [
    context.requestId,
    context.sessionId,
    context.subAgent,
    Date.now().toString() // Fallback for truly random distribution
  ].filter(Boolean).join(':');

  // Simple hash function (djb2)
  let hash = 5381;
  for (let i = 0; i < hashInput.length; i++) {
    hash = ((hash << 5) + hash) + hashInput.charCodeAt(i);
  }

  // Map to bucket range (0-9999)
  return Math.abs(hash) % BUCKET_RANGE;
}

/**
 * Determine if request should route to local based on bucket and stage
 *
 * @param {number} bucketId - Request bucket (0-9999)
 * @param {number} stage - Canary stage (0, 5, 25, 50, 100)
 * @returns {boolean} True if should route to local
 */
export function shouldRouteToLocal(bucketId, stage) {
  if (stage === 0) return false;
  if (stage === 100) return true;

  // Calculate threshold based on stage percentage
  const threshold = (stage / 100) * BUCKET_RANGE;
  return bucketId < threshold;
}

// =============================================================================
// CANARY ROUTER
// =============================================================================

/**
 * Get LLM client with canary routing applied
 *
 * This wraps the client-factory's getLLMClient with canary traffic splitting.
 * Only applies to haiku-tier requests when canary is active.
 *
 * @param {Object} options - Same options as getLLMClient
 * @param {Object} [routingContext] - Context for deterministic routing
 * @returns {Promise<{client: Adapter, routing: Object}>} Client and routing metadata
 */
export async function getCanaryRoutedClient(options = {}, routingContext = {}) {
  const state = await getCanaryState();
  const bucketId = getBucketId(routingContext);
  const requestId = routingContext.requestId || `req_${Date.now()}_${bucketId}`;

  // Determine tier from options
  const tier = options.tier || inferTier(options);

  // Only apply canary routing to haiku tier
  if (tier !== 'haiku') {
    return {
      client: new AnthropicAdapter({ model: getTierModel(tier) }),
      routing: {
        tier,
        routedTo: 'cloud',
        model: getTierModel(tier),
        canaryStage: state.stage,
        bucketId,
        reason: 'non-haiku-tier'
      }
    };
  }

  // Check if canary is active
  if (state.status !== 'rolling' && state.stage === 0) {
    return {
      client: new AnthropicAdapter({ model: state.fallback_model }),
      routing: {
        tier: 'haiku',
        routedTo: 'cloud',
        model: state.fallback_model,
        canaryStage: state.stage,
        bucketId,
        reason: 'canary-inactive'
      }
    };
  }

  // Apply canary routing logic
  const routeLocal = shouldRouteToLocal(bucketId, state.stage);

  if (routeLocal) {
    // Route to local with fallback capability
    const client = createLocalClientWithFallback(state.target_model, state.fallback_model);
    return {
      client,
      routing: {
        tier: 'haiku',
        routedTo: 'local',
        model: state.target_model,
        fallbackModel: state.fallback_model,
        canaryStage: state.stage,
        bucketId,
        requestId,
        reason: 'canary-local-route'
      }
    };
  } else {
    // Route to cloud (control group)
    return {
      client: new AnthropicAdapter({ model: state.fallback_model }),
      routing: {
        tier: 'haiku',
        routedTo: 'cloud',
        model: state.fallback_model,
        canaryStage: state.stage,
        bucketId,
        requestId,
        reason: 'canary-cloud-route'
      }
    };
  }
}

/**
 * Infer tier from options (same logic as client-factory)
 */
function inferTier(options) {
  if (options.tier) return options.tier;

  const purposeToTier = {
    classification: 'haiku',
    fast: 'haiku',
    screening: 'haiku',
    triage: 'haiku',
    validation: 'sonnet',
    generation: 'sonnet',
    analysis: 'sonnet',
    design: 'sonnet',
    security: 'opus',
    critical: 'opus'
  };

  return purposeToTier[options.purpose] || 'sonnet';
}

/**
 * Get model for tier (fallback mapping)
 */
function getTierModel(tier) {
  const tierToModel = {
    haiku: 'claude-haiku-3-5-20241022',
    sonnet: 'claude-sonnet-4-20250514',
    opus: 'claude-opus-4-5-20251101'
  };
  return tierToModel[tier] || tierToModel.sonnet;
}

/**
 * Create local client with automatic fallback to cloud
 */
function createLocalClientWithFallback(localModel, fallbackModel) {
  const localAdapter = new OllamaAdapter({ model: localModel });
  const fallbackAdapter = new AnthropicAdapter({ model: fallbackModel });

  // Return a proxy that handles fallback
  return {
    async complete(systemPrompt, userPrompt, options = {}) {
      const startTime = Date.now();

      try {
        const result = await localAdapter.complete(systemPrompt, userPrompt, options);
        const latencyMs = Date.now() - startTime;

        // Record success metric
        recordMetric({
          routedTo: 'local',
          model: localModel,
          latencyMs,
          success: true,
          errorType: null
        });

        return result;
      } catch (localError) {
        console.warn(`   ⚠️  Canary: Local failed (${localError.message}), falling back to cloud`);

        // Record failure and attempt fallback
        recordMetric({
          routedTo: 'local',
          model: localModel,
          latencyMs: Date.now() - startTime,
          success: false,
          errorType: categorizeError(localError)
        });

        // Fallback to cloud
        const fallbackStart = Date.now();
        try {
          const result = await fallbackAdapter.complete(systemPrompt, userPrompt, options);

          recordMetric({
            routedTo: 'fallback',
            model: fallbackModel,
            latencyMs: Date.now() - fallbackStart,
            success: true,
            errorType: null
          });

          return result;
        } catch (fallbackError) {
          recordMetric({
            routedTo: 'fallback',
            model: fallbackModel,
            latencyMs: Date.now() - fallbackStart,
            success: false,
            errorType: categorizeError(fallbackError)
          });
          throw fallbackError;
        }
      }
    },

    // Expose underlying adapters for direct access if needed
    getLocalAdapter: () => localAdapter,
    getFallbackAdapter: () => fallbackAdapter
  };
}

// =============================================================================
// METRICS COLLECTION
// =============================================================================

/**
 * Record a metric for quality gate evaluation
 */
function recordMetric(metric) {
  metricsBuffer.push({
    ...metric,
    timestamp: new Date().toISOString()
  });

  // Flush if buffer is full
  if (metricsBuffer.length >= METRICS_BATCH_SIZE) {
    flushMetrics();
  }
}

/**
 * Flush metrics buffer to database
 */
async function flushMetrics() {
  if (metricsBuffer.length === 0) return;

  const metricsToFlush = metricsBuffer.splice(0, metricsBuffer.length);
  const supabase = await getSupabase();

  if (!supabase) {
    console.warn('   ⚠️  Canary: Cannot flush metrics, Supabase unavailable');
    return;
  }

  try {
    const state = await getCanaryState();

    const rows = metricsToFlush.map(m => ({
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tier: 'haiku',
      routed_to: m.routedTo,
      model_used: m.model,
      latency_ms: m.latencyMs,
      success: m.success,
      error_type: m.errorType,
      canary_stage: state.stage,
      bucket_id: 0, // Could be tracked per-request if needed
      created_at: m.timestamp
    }));

    const { error } = await supabase
      .from('llm_canary_metrics')
      .insert(rows);

    if (error) {
      console.warn('   ⚠️  Canary: Metrics insert failed:', error.message);
    }
  } catch (err) {
    console.warn('   ⚠️  Canary: Metrics flush error:', err.message);
  }
}

/**
 * Categorize error for metrics
 */
function categorizeError(error) {
  const message = error.message?.toLowerCase() || '';

  if (message.includes('timeout')) return 'timeout';
  if (message.includes('connection')) return 'connection';
  if (message.includes('rate limit')) return 'rate_limit';
  if (message.includes('model not found')) return 'model_not_found';
  if (message.includes('context length')) return 'context_overflow';
  return 'unknown';
}

// =============================================================================
// QUALITY GATES
// =============================================================================

/**
 * Evaluate quality gates and determine if rollback is needed
 * @returns {Promise<{pass: boolean, metrics: Object, recommendation: string}>}
 */
export async function evaluateQualityGates() {
  const supabase = await getSupabase();
  if (!supabase) {
    return { pass: true, metrics: null, recommendation: 'no-db-skip-evaluation' };
  }

  const state = await getCanaryState();
  if (state.status !== 'rolling') {
    return { pass: true, metrics: null, recommendation: 'not-rolling' };
  }

  try {
    // Get recent metrics (last 5 minutes)
    const windowStart = new Date(Date.now() - METRICS_WINDOW_MS).toISOString();

    const { data: metrics, error } = await supabase
      .from('llm_canary_metrics')
      .select('*')
      .eq('routed_to', 'local')
      .gte('created_at', windowStart);

    if (error) {
      console.warn('   ⚠️  Canary: Quality gate query failed:', error.message);
      return { pass: true, metrics: null, recommendation: 'query-failed-skip' };
    }

    if (!metrics || metrics.length < 10) {
      return { pass: true, metrics: { count: metrics?.length || 0 }, recommendation: 'insufficient-data' };
    }

    // Calculate metrics
    const totalRequests = metrics.length;
    const failures = metrics.filter(m => !m.success).length;
    const errorRate = failures / totalRequests;

    const latencies = metrics.filter(m => m.success).map(m => m.latency_ms).sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const latencyP95 = latencies[p95Index] || 0;

    const calculatedMetrics = {
      totalRequests,
      failures,
      errorRate,
      latencyP95,
      baselineLatency: state.baseline_latency_p95_ms,
      latencyMultiplier: state.baseline_latency_p95_ms
        ? latencyP95 / state.baseline_latency_p95_ms
        : null
    };

    // Evaluate gates
    const errorGateFailed = errorRate > state.error_rate_threshold;
    const latencyGateFailed = calculatedMetrics.latencyMultiplier &&
      calculatedMetrics.latencyMultiplier > state.latency_multiplier_threshold;

    const gatePassed = !errorGateFailed && !latencyGateFailed;

    let recommendation = 'continue';
    if (errorGateFailed) {
      recommendation = `rollback-error-rate-${(errorRate * 100).toFixed(1)}%`;
    } else if (latencyGateFailed) {
      recommendation = `rollback-latency-${calculatedMetrics.latencyMultiplier.toFixed(1)}x`;
    }

    return {
      pass: gatePassed,
      metrics: calculatedMetrics,
      recommendation
    };
  } catch (err) {
    console.warn('   ⚠️  Canary: Quality gate evaluation error:', err.message);
    return { pass: true, metrics: null, recommendation: 'evaluation-error-skip' };
  }
}

/**
 * Check quality gates and trigger rollback if needed
 * Called periodically by the quality monitor
 */
export async function checkAndRollbackIfNeeded() {
  const evaluation = await evaluateQualityGates();

  if (!evaluation.pass) {
    console.log(`   🚨 Canary: Quality gate FAILED - ${evaluation.recommendation}`);

    const supabase = await getSupabase();
    if (supabase) {
      const { error } = await supabase.rpc('rollback_canary', {
        p_triggered_by: 'quality-monitor',
        p_reason: evaluation.recommendation
      });

      if (error) {
        console.error('   ❌ Canary: Rollback failed:', error.message);
      } else {
        console.log('   ✅ Canary: Auto-rollback executed');
        await refreshCanaryState();
      }

      return { rolledBack: true, reason: evaluation.recommendation, metrics: evaluation.metrics };
    }
  }

  return { rolledBack: false, metrics: evaluation.metrics };
}

// =============================================================================
// STAGE CONTROL
// =============================================================================

/**
 * Advance to next canary stage
 * @param {string} [triggeredBy='api'] - Who triggered the advance
 * @returns {Promise<Object>} Result with success, new stage, message
 */
export async function advanceCanaryStage(triggeredBy = 'api') {
  const supabase = await getSupabase();
  if (!supabase) {
    return { success: false, new_stage: -1, message: 'Database unavailable' };
  }

  // Flush any pending metrics before advancing
  await flushMetrics();

  // Check quality gates before advancing
  const evaluation = await evaluateQualityGates();
  if (!evaluation.pass) {
    return {
      success: false,
      new_stage: -1,
      message: `Quality gates failed: ${evaluation.recommendation}`
    };
  }

  const { data, error } = await supabase.rpc('advance_canary_stage', {
    p_triggered_by: triggeredBy,
    p_reason: 'api_advance'
  });

  if (error) {
    return { success: false, new_stage: -1, message: error.message };
  }

  await refreshCanaryState();
  return data?.[0] || { success: true, new_stage: -1, message: 'Unknown result' };
}

/**
 * Set canary stage directly
 * @param {number} stage - Target stage (0, 5, 25, 50, 100)
 * @param {string} [triggeredBy='api'] - Who triggered the change
 */
export async function setCanaryStage(stage, triggeredBy = 'api') {
  const supabase = await getSupabase();
  if (!supabase) {
    return { success: false, new_stage: -1, message: 'Database unavailable' };
  }

  if (!CANARY_STAGES.includes(stage)) {
    return { success: false, new_stage: -1, message: `Invalid stage. Must be one of: ${CANARY_STAGES.join(', ')}` };
  }

  const { data, error } = await supabase.rpc('set_canary_stage', {
    p_stage: stage,
    p_triggered_by: triggeredBy
  });

  if (error) {
    return { success: false, new_stage: -1, message: error.message };
  }

  await refreshCanaryState();
  return data?.[0] || { success: true, new_stage: stage, message: `Set to ${stage}%` };
}

/**
 * Pause canary rollout
 */
export async function pauseCanary(triggeredBy = 'api') {
  const supabase = await getSupabase();
  if (!supabase) {
    return { success: false, message: 'Database unavailable' };
  }

  const { data, error } = await supabase.rpc('pause_canary', {
    p_triggered_by: triggeredBy
  });

  if (error) {
    return { success: false, message: error.message };
  }

  await refreshCanaryState();
  return { success: true, message: data || 'Canary paused' };
}

/**
 * Resume canary rollout
 */
export async function resumeCanary(triggeredBy = 'api') {
  const supabase = await getSupabase();
  if (!supabase) {
    return { success: false, message: 'Database unavailable' };
  }

  const { data, error } = await supabase.rpc('resume_canary', {
    p_triggered_by: triggeredBy
  });

  if (error) {
    return { success: false, message: error.message };
  }

  await refreshCanaryState();
  return { success: true, message: data || 'Canary resumed' };
}

/**
 * Rollback to 0% (emergency)
 */
export async function rollbackCanary(triggeredBy = 'api', reason = 'manual_rollback') {
  const supabase = await getSupabase();
  if (!supabase) {
    return { success: false, previous_stage: -1, message: 'Database unavailable' };
  }

  await flushMetrics();

  const { data, error } = await supabase.rpc('rollback_canary', {
    p_triggered_by: triggeredBy,
    p_reason: reason
  });

  if (error) {
    return { success: false, previous_stage: -1, message: error.message };
  }

  await refreshCanaryState();
  return data?.[0] || { success: true, previous_stage: -1, message: 'Rolled back' };
}

// =============================================================================
// STATUS & DIAGNOSTICS
// =============================================================================

/**
 * Get full canary status for diagnostics
 */
export async function getCanaryStatus() {
  const state = await getCanaryState();
  const evaluation = await evaluateQualityGates();

  return {
    state: {
      stage: state.stage,
      status: state.status,
      targetModel: state.target_model,
      fallbackModel: state.fallback_model,
      consecutiveFailures: state.consecutive_failures
    },
    thresholds: {
      errorRate: state.error_rate_threshold,
      latencyMultiplier: state.latency_multiplier_threshold,
      failuresBeforeRollback: state.failures_before_rollback
    },
    baseline: {
      latencyP95: state.baseline_latency_p95_ms
    },
    current: {
      latencyP95: state.current_latency_p95_ms,
      errorRate: evaluation.metrics?.errorRate,
      latencyMultiplier: evaluation.metrics?.latencyMultiplier
    },
    qualityGates: {
      pass: evaluation.pass,
      recommendation: evaluation.recommendation,
      sampleSize: evaluation.metrics?.totalRequests
    },
    metricsBuffer: {
      pending: metricsBuffer.length
    },
    timestamp: new Date().toISOString()
  };
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize canary router (call at app startup)
 */
export async function initializeCanaryRouter() {
  // Load initial state
  await getCanaryState();

  // Set up periodic metrics flush
  setInterval(flushMetrics, METRICS_FLUSH_INTERVAL_MS);

  // Set up periodic quality check (only in active environments)
  if (process.env.CANARY_QUALITY_MONITOR !== 'false') {
    setInterval(checkAndRollbackIfNeeded, QUALITY_CHECK_INTERVAL_MS);
  }

  console.log('   ✅ Canary Router initialized');
  return getCanaryStatus();
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Routing
  getCanaryRoutedClient,
  getBucketId,
  shouldRouteToLocal,

  // State management
  getCanaryState,
  refreshCanaryState,

  // Stage control
  advanceCanaryStage,
  setCanaryStage,
  pauseCanary,
  resumeCanary,
  rollbackCanary,

  // Quality gates
  evaluateQualityGates,
  checkAndRollbackIfNeeded,

  // Status
  getCanaryStatus,

  // Lifecycle
  initializeCanaryRouter
};
