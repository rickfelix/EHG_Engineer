// ============================================================================
// Context-usage burn feed — pure helpers for the statusline JSONL append
// SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001 (FR-4)
// ============================================================================
// The queryable burn sink (context_usage_log table + scripts/sync-context-usage.js +
// get_context_usage_summary RPC) already exists but was STARVED: the active
// .claude/statusline.cjs never appended the .claude/logs/context-usage.jsonl feed the
// sync script ingests (only the retired shell tracker did). These pure helpers build
// contract-shaped entries (sync-context-usage transformEntry field parity) and throttle
// appends to meaningful changes so the statusline hot path stays cheap.
//
// Turns/hour then falls out as row cadence per session — "which session is the burner"
// becomes a query, not an investigation.
'use strict';

// Append only when the reading is meaningful: first sample, a percent change, or a
// status transition. A repaint with identical percent+status is throttled (no append).
function shouldAppendUsage(prevState, next) {
  if (!next || typeof next.usage_percent !== 'number') return false;
  if (!prevState) return true;
  return prevState.last_percent !== next.usage_percent || prevState.last_status !== next.status;
}

// Build a JSONL entry matching scripts/sync-context-usage.js transformEntry field shape.
function buildUsageEntry({ sessionId, modelId, contextUsed, contextSize, usagePercent, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, status, cwd, now }) {
  return {
    session_id: sessionId || 'unknown',
    timestamp: (now instanceof Date ? now : new Date()).toISOString(),
    model_id: modelId || 'unknown',
    context_used: contextUsed | 0,
    context_size: contextSize | 0,
    usage_percent: usagePercent | 0,
    input_tokens: inputTokens | 0,
    output_tokens: outputTokens | 0,
    cache_creation_tokens: cacheCreationTokens | 0,
    cache_read_tokens: cacheReadTokens | 0,
    status: status || 'HEALTHY',
    compaction_detected: false,
    working_directory: cwd || '',
  };
}

module.exports = { shouldAppendUsage, buildUsageEntry };
