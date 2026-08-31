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

const fs = require('fs');
const path = require('path');

// SD-LEO-INFRA-LEO-PHASE-TAGGED-001 (FR-2): read the per-worktree state file written by
// sd-start.js/handoff.js (lib/leo-status-file.js). Callers must pass the SAME cwd value
// used to locate .leo-status.json elsewhere in this file's caller (statusline.cjs resolves
// it from the hook's own `data.cwd`, NOT process.cwd() — those can differ) — hence a
// dedicated leoStatusCwd param rather than reusing the unrelated `cwd` field below (which
// only feeds the working_directory JSONL field). Fail-soft: any read error yields {}.
function readLeoStatus(leoStatusCwd) {
  if (!leoStatusCwd) return {};
  try {
    const raw = fs.readFileSync(path.join(leoStatusCwd, '.leo-status.json'), 'utf8');
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

// Append only when the reading is meaningful: first sample, a percent change, or a
// status transition. A repaint with identical percent+status is throttled (no append).
function shouldAppendUsage(prevState, next) {
  if (!next || typeof next.usage_percent !== 'number') return false;
  if (!prevState) return true;
  return prevState.last_percent !== next.usage_percent || prevState.last_status !== next.status;
}

// Build a JSONL entry matching scripts/sync-context-usage.js transformEntry field shape.
// SD-LEO-INFRA-BURN-TELEMETRY-PER-001-C (FR-2): loop_name identifies a recurring task an
// interactive Claude Code session is running (e.g. a /loop-driven fleet worker's check-in
// cycle). Read from CLAUDE_LOOP_NAME, OMITTED from the entry (not set to null) when unset —
// matches this function's existing pattern of falling back rather than emitting a null key.
function buildUsageEntry({ sessionId, modelId, contextUsed, contextSize, usagePercent, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, status, cwd, now, leoStatusCwd }) {
  const entry = {
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
  if (process.env.CLAUDE_LOOP_NAME) entry.loop_name = process.env.CLAUDE_LOOP_NAME;
  const leoStatus = readLeoStatus(leoStatusCwd);
  if (leoStatus.sd_key) entry.sd_key = leoStatus.sd_key;
  if (leoStatus.leo_phase) entry.leo_phase = leoStatus.leo_phase;
  return entry;
}

module.exports = { shouldAppendUsage, buildUsageEntry, readLeoStatus };
