/**
 * Token Budget Tracker for EVA Pipeline
 * SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-C
 *
 * Records token usage to venture_token_ledger and checks budget status
 * via get_venture_token_budget_status RPC. All operations are non-blocking
 * (fire-and-forget) to avoid impacting pipeline latency.
 */

import { randomUUID } from 'crypto';

const BUDGET_CHECK_TIMEOUT_MS = 2000;
const BUDGET_CACHE_TTL_MS = 60_000;

// In-memory budget cache: ventureId → { data, cachedAt }
// DESIGN NOTE: This cache is intentionally process-scoped (not shared across workers or processes).
// In a multi-worker deployment each worker maintains its own independent copy with up to
// BUDGET_CACHE_TTL_MS (60s) of staleness. This is an acceptable trade-off for CLI/single-process
// execution. If multi-worker budget consistency is required in the future, replace with a
// Redis/Supabase-backed shared cache.
const budgetCache = new Map();

/**
 * Record token usage from an LLM call into venture_token_ledger.
 * Fire-and-forget: errors are logged but never thrown.
 *
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {number} params.stageId - Lifecycle stage number
 * @param {Object} params.usage - Token usage from LLM response
 * @param {number} [params.usage.inputTokens=0]
 * @param {number} [params.usage.outputTokens=0]
 * @param {Object} [params.metadata] - Additional metadata
 * @param {string} [params.metadata.agentType] - e.g. 'claude', 'openai'
 * @param {string} [params.metadata.modelId] - e.g. 'claude-opus-4-6'
 * @param {string} [params.metadata.operationType] - e.g. 'analysis', 'generation'
 * @param {string} [params.metadata.stepId] - Analysis step identifier
 * @param {number} [params.metadata.attempt] - Retry attempt number
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger (defaults to console)
 */
export function recordTokenUsage({ ventureId, stageId, usage, metadata = {} }, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    logger.warn('[TokenTracker] No supabase client — skipping token recording');
    return;
  }

  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;

  if (inputTokens === 0 && outputTokens === 0 && !usage) {
    logger.warn('[TokenTracker] Missing usage data — recording zeros');
  }

  const row = {
    id: randomUUID(),
    venture_id: ventureId,
    lifecycle_stage: stageId,
    tokens_input: inputTokens,
    tokens_output: outputTokens,
    agent_type: metadata.agentType || null,
    model_id: metadata.modelId || null,
    operation_type: metadata.operationType || null,
    budget_profile: metadata.budgetProfile || 'standard',
    is_simulation: false,
    metadata: {
      step_id: metadata.stepId || null,
      attempt: metadata.attempt || 1,
      recorded_by: 'eva-token-tracker',
    },
    created_at: new Date().toISOString(),
    created_by: 'eva-orchestrator',
  };

  // Fire-and-forget: do not await
  supabase
    .from('venture_token_ledger')
    .insert(row)
    .then(({ error }) => {
      if (error) {
        logger.warn(`[TokenTracker] Insert failed (non-fatal): ${error.message}`);
      }
    })
    .catch((err) => {
      logger.warn(`[TokenTracker] Insert error (non-fatal): ${err.message}`);
    });

  // Invalidate budget cache for this venture since usage changed
  budgetCache.delete(ventureId);
}

/**
 * Check token budget status for a venture.
 * Returns budget info or null on timeout/error.
 *
 * @param {string} ventureId - Venture UUID
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object|null>} Budget status or null
 */
export async function checkBudget(ventureId, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    logger.warn('[TokenTracker] No supabase client — skipping budget check');
    return null;
  }

  // Check cache first
  const cached = budgetCache.get(ventureId);
  if (cached && (Date.now() - cached.cachedAt) < BUDGET_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const result = await Promise.race([
      supabase.rpc('get_venture_token_budget_status', { p_venture_id: ventureId }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Budget check timeout')), BUDGET_CHECK_TIMEOUT_MS)
      ),
    ]);

    if (result.error) {
      logger.warn(`[TokenTracker] Budget check RPC error: ${result.error.message}`);
      return null;
    }

    const budgetData = Array.isArray(result.data) ? result.data[0] : result.data;
    if (budgetData) {
      budgetCache.set(ventureId, { data: budgetData, cachedAt: Date.now() });
    }
    return budgetData || null;
  } catch (err) {
    logger.warn(`[TokenTracker] Budget check failed: ${err.message}`);
    return null;
  }
}

/**
 * Build a token usage summary object for stage output metadata.
 *
 * @param {Object[]} stageUsages - Array of { inputTokens, outputTokens } from stage steps
 * @param {Object|null} budgetStatus - Result from checkBudget()
 * @returns {Object} Token usage summary
 */
export function buildTokenSummary(stageUsages, budgetStatus) {
  const inputTokens = stageUsages.reduce((sum, u) => sum + (u?.inputTokens ?? 0), 0);
  const outputTokens = stageUsages.reduce((sum, u) => sum + (u?.outputTokens ?? 0), 0);
  const totalTokens = inputTokens + outputTokens;

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    cumulative_tokens: budgetStatus?.tokens_used ?? null,
    budget_remaining_pct: budgetStatus?.usage_percentage != null
      ? Math.max(0, 100 - budgetStatus.usage_percentage)
      : null,
    is_over_budget: budgetStatus?.is_over_budget ?? null,
  };
}

// Exported for testing
export const _internal = {
  budgetCache,
  BUDGET_CHECK_TIMEOUT_MS,
  BUDGET_CACHE_TTL_MS,
};
