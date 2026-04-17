/**
 * tool-timeout.cjs — Extract tool timeout budget from Claude Code tool input.
 *
 * Part of SD-LEO-INFRA-WORKER-SOURCE-SIDE-001.
 *
 * Purpose: classify how long a tool call is expected to take so PreToolUse
 * can write an honest `expected_silence_until` to claude_sessions. The sweep
 * script consults that field before releasing a claim, cutting false-stale
 * releases caused by silent-but-alive workers (long Bash, Agent invocations).
 *
 * Hard caps (enforced here; do NOT move this cap into caller code):
 *   MAX_SILENCE_MS = 30 * 60 * 1000  // 30 minutes, per-call
 *
 * Returns null for tools whose duration is effectively instant — PreToolUse
 * should NOT write expected_silence_until in that case.
 */

'use strict';

const MINUTE_MS = 60 * 1000;
const SECOND_MS = 1000;

// Hard fleet cap — even if a caller passes a higher timeout we never promise
// silence beyond 30 minutes. Callers must clamp using clampSilenceMs below.
const MAX_SILENCE_MS = 30 * MINUTE_MS;

// Defaults used when tool input does not specify a timeout.
const DEFAULT_AGENT_SILENCE_MS   = 30 * MINUTE_MS;   // p95 observed for Task/Agent
const DEFAULT_WEBFETCH_MS        = 30 * SECOND_MS;
const DEFAULT_BASH_MS            = 2  * MINUTE_MS;   // Claude Code default
const TOOL_BUFFER_MS             = 30 * SECOND_MS;   // added after raw timeout
const MIN_SILENCE_WINDOW_MS      = 2  * MINUTE_MS;   // floor so dashboards don't flicker

/**
 * Extract the expected maximum wall time for a tool call, in milliseconds.
 *
 * @param {string} toolName — CLAUDE_TOOL_NAME
 * @param {object|string|null} toolInput — parsed CLAUDE_TOOL_INPUT (pass raw JSON string or object)
 * @returns {number|null} expected tool duration in ms, or null if the tool is effectively instant
 */
function extractToolTimeout(toolName, toolInput) {
  if (!toolName) return null;

  const input = normalizeInput(toolInput);
  const name = String(toolName);

  // Bash — honor explicit timeout, fall back to Claude Code default (120s).
  if (name === 'Bash') {
    const raw = Number(input?.timeout);
    if (Number.isFinite(raw) && raw > 0) return raw;
    return DEFAULT_BASH_MS;
  }

  // Agent / Task — indeterminate wall time; use fleet-wide p95 default.
  if (name === 'Agent' || name === 'Task') {
    const raw = Number(input?.timeout);
    if (Number.isFinite(raw) && raw > 0) return raw;
    return DEFAULT_AGENT_SILENCE_MS;
  }

  // WebFetch — short by default; honor explicit override if passed.
  if (name === 'WebFetch') {
    const raw = Number(input?.timeout);
    if (Number.isFinite(raw) && raw > 0) return raw;
    return DEFAULT_WEBFETCH_MS;
  }

  // Everything else (Edit/Write/Read/Glob/Grep/...) is effectively instant.
  return null;
}

/**
 * Compute the expected_silence_until offset (in ms from now) for the given
 * tool call. Applies the TOOL_BUFFER_MS, MIN_SILENCE_WINDOW_MS floor, and
 * MAX_SILENCE_MS hard cap.
 *
 * Returns null if the tool is too short to warrant a silence window — caller
 * should leave expected_silence_until NULL in that case.
 *
 * @param {string} toolName
 * @param {object|string|null} toolInput
 * @returns {number|null} silence window in ms, or null
 */
function computeExpectedSilenceMs(toolName, toolInput) {
  const budget = extractToolTimeout(toolName, toolInput);
  if (budget === null) return null;

  // Only write expected_silence_until if tool is non-trivial (>60s).
  // Below that, heartbeat_at is already good enough; we'd just add DB noise.
  if (budget < 60 * SECOND_MS) return null;

  const withBuffer = Math.max(budget, MIN_SILENCE_WINDOW_MS) + TOOL_BUFFER_MS;
  return clampSilenceMs(withBuffer);
}

/**
 * Compute the expected end of a tool call (ms from now), used for
 * current_tool_expected_end_at. Unlike expected_silence_until, this DOES fire
 * for short tools — it just won't be far in the future.
 *
 * @param {string} toolName
 * @param {object|string|null} toolInput
 * @returns {number|null} expected end in ms from now, or null if instant
 */
function computeExpectedEndMs(toolName, toolInput) {
  const budget = extractToolTimeout(toolName, toolInput);
  if (budget === null) return null;
  return budget + TOOL_BUFFER_MS;
}

/**
 * Classify the worker's activity kind based on tool.
 *
 * @param {string} toolName
 * @returns {'executing'|'waiting_tool'|'waiting_agent'|null}
 */
function classifyActivityKind(toolName) {
  if (!toolName) return null;
  if (toolName === 'Agent' || toolName === 'Task') return 'waiting_agent';
  if (toolName === 'Bash' || toolName === 'WebFetch') return 'waiting_tool';
  return 'executing';
}

/**
 * Clamp a silence window to the fleet-wide hard cap (30 minutes).
 * The sweep ALSO enforces this cap independently — defense in depth.
 *
 * @param {number} ms
 * @returns {number}
 */
function clampSilenceMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.min(ms, MAX_SILENCE_MS);
}

function normalizeInput(toolInput) {
  if (!toolInput) return null;
  if (typeof toolInput === 'object') return toolInput;
  if (typeof toolInput === 'string') {
    try { return JSON.parse(toolInput); } catch { return null; }
  }
  return null;
}

module.exports = {
  extractToolTimeout,
  computeExpectedSilenceMs,
  computeExpectedEndMs,
  classifyActivityKind,
  clampSilenceMs,
  // exported for tests
  MAX_SILENCE_MS,
  DEFAULT_AGENT_SILENCE_MS,
  DEFAULT_WEBFETCH_MS,
  DEFAULT_BASH_MS,
  TOOL_BUFFER_MS,
  MIN_SILENCE_WINDOW_MS,
};
