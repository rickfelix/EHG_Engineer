/**
 * LLM Usage Logger
 * SD-LEO-INFRA-LLM-RESPONSE-CACHING-001
 *
 * Non-blocking token usage logger that writes to model_usage_log table.
 * Fire-and-forget pattern ensures LLM calls are never delayed by logging.
 *
 * @module lib/llm/usage-logger
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

let supabase = null;

function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      supabase = createClient(url, key);
    }
  }
  return supabase;
}

// SD-LEO-INFRA-FACTORY-COST-UNIT-001 (FR-3): sd_id attribution fallback.
// Only ~7% of rows carried sd_id because most callsites never pass it. When the
// caller omits sdId, fall back to (a) LEO_SD_KEY env, else (b) a one-time cached
// lookup of this session's active claim (claude_sessions.sd_key). The lookup is
// lazy, cached for process lifetime (including null results), and fail-soft —
// it can never throw or block the fire-and-forget logging path.
let claimSdPromise = null;

function resolveFallbackSdId(db) {
  if (process.env.LEO_SD_KEY) return Promise.resolve(process.env.LEO_SD_KEY);
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId || !db) return Promise.resolve(null);
  if (!claimSdPromise) {
    claimSdPromise = db
      .from('claude_sessions')
      .select('sd_key')
      .eq('session_id', sessionId)
      .maybeSingle()
      .then(({ data }) => data?.sd_key || null)
      .catch(() => null);
  }
  return claimSdPromise;
}

/** Test-only: reset the cached claim lookup between cases. */
export function _resetClaimCacheForTest() {
  claimSdPromise = null;
}

/**
 * Log an LLM call to model_usage_log (fire-and-forget).
 *
 * @param {Object} params
 * @param {string} params.model - Model name/ID used
 * @param {string} params.provider - Provider (anthropic, google, ollama, openai)
 * @param {string} [params.purpose] - Callsite purpose (classification, validation, etc.)
 * @param {number} [params.inputTokens] - Input token count
 * @param {number} [params.outputTokens] - Output token count
 * @param {number} [params.durationMs] - Call duration in ms
 * @param {boolean} [params.cacheHit] - Whether response was from cache
 * @param {string} [params.sdId] - Current SD being worked on
 * @param {string} [params.phase] - Current LEO phase
 */
export function logUsage({
  model,
  provider,
  purpose,
  inputTokens,
  outputTokens,
  durationMs,
  cacheHit = false,
  sdId,
  phase
} = {}) {
  const db = getSupabase();
  if (!db) return;

  const buildRow = (resolvedSdId) => ({
    id: randomUUID(),
    reported_model_name: model || 'unknown',
    reported_model_id: model || 'unknown',
    session_id: process.env.CLAUDE_SESSION_ID || null,
    sd_id: sdId || resolvedSdId || null,
    phase: phase || 'UNKNOWN',
    subagent_type: purpose || null,
    metadata: {
      provider,
      purpose,
      input_tokens: inputTokens || 0,
      output_tokens: outputTokens || 0,
      duration_ms: durationMs || 0,
      cache_hit: cacheHit,
      logged_at: new Date().toISOString()
    }
  });

  // Fire-and-forget: don't await, don't throw. FR-3 fallback resolves sd_id
  // (explicit sdId short-circuits; env/claim fallback otherwise; null on failure).
  const sdResolution = sdId ? Promise.resolve(sdId) : resolveFallbackSdId(db);
  sdResolution
    .catch(() => null)
    .then((resolvedSdId) => db.from('model_usage_log').insert(buildRow(resolvedSdId)))
    .then(({ error }) => {
      if (error) {
        // Silent failure - logging should never break LLM calls
        if (process.env.DEBUG_LLM_LOGGING === 'true') {
          console.warn('[usage-logger] Insert failed:', error.message);
        }
      }
    })
    .catch(() => {
      // Swallow all errors
    });
}

export default { logUsage };
