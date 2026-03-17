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

  const row = {
    id: randomUUID(),
    reported_model_name: model || 'unknown',
    reported_model_id: model || 'unknown',
    session_id: process.env.CLAUDE_SESSION_ID || null,
    sd_id: sdId || null,
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
  };

  // Fire-and-forget: don't await, don't throw
  db.from('model_usage_log')
    .insert(row)
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
