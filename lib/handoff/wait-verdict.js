/**
 * Centralized WAIT-verdict helper for handoff gates.
 * SD-LEO-INFRA-EXTEND-WAIT-VERDICT-001
 *
 * Background: PR #4021 (SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001) introduced the
 * "WAIT" verdict — a gate result shaped like a failure (passed:false) but carrying
 * `wait:true`, which the ValidationOrchestrator treats as a transient race-window
 * block rather than a real failure. Unlike a FAIL, a WAIT does NOT burn retry
 * budget or trigger RCA; the orchestrator re-checks the gate later.
 *
 * PR #4021 applied this ONLY to the parent-orchestrator prerequisite check
 * (scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js).
 * This module extends the pattern to the TESTING, SUB_AGENT_EVIDENCE, and
 * MIGRATION gates and adds a max-wait safety ceiling so a permanently-stuck
 * race window eventually surfaces as a real failure (TR-4).
 *
 * SHAPE CONTRACT (mirrors prerequisite-check.js wait verdict — do not diverge):
 *   { passed:false, wait:true, score, max_score, issues, wait_reason, details }
 * plus optional `warnings` and `remediation` passthroughs (the orchestrator copies
 * `warnings` into its aggregate, and `wait_reason` into waitReasons).
 *
 * TR-1: all gate WAIT/FAIL result construction goes through buildWaitResult /
 * buildFailResult — no inline `{ passed:false, wait:true, ... }` literals in gate code.
 */

/**
 * Build a WAIT verdict (transient race-window block, NOT a failure).
 * Mirrors the prerequisite-check.js wait-result shape exactly.
 *
 * @param {Object} opts
 * @param {number} [opts.score=0]
 * @param {number} [opts.max_score=100]
 * @param {string} opts.wait_reason - Human-readable reason for the wait.
 * @param {string[]} [opts.issues=[]] - Should normally be empty for waits.
 * @param {string[]} [opts.warnings] - Optional warning strings (orchestrator copies these).
 * @param {string} [opts.remediation] - Optional remediation guidance.
 * @param {Object} [opts.details={}] - Gate-specific details (placed under `details`).
 * @returns {Object} WAIT-shaped gate result.
 */
export function buildWaitResult({
  score = 0,
  max_score = 100,
  wait_reason,
  issues = [],
  warnings,
  remediation,
  details = {},
} = {}) {
  const result = {
    passed: false,
    wait: true,
    score,
    max_score,
    issues,
    wait_reason: wait_reason || 'Transient race-window block; re-checking later',
    details,
  };
  // Default warnings to surface the wait reason if the caller didn't supply any.
  result.warnings = Array.isArray(warnings)
    ? warnings
    : [`WAIT: ${result.wait_reason}`];
  if (remediation) result.remediation = remediation;
  return result;
}

/**
 * Build a normal FAIL verdict (real failure — burns retry budget, may trigger RCA).
 * Explicitly carries `wait:false` so callers/consumers can distinguish it from a WAIT.
 *
 * @param {Object} opts
 * @param {number} [opts.score=0]
 * @param {number} [opts.max_score=100]
 * @param {string[]} [opts.issues=[]]
 * @param {string} [opts.remediation] - Optional remediation guidance.
 * @param {string[]} [opts.warnings] - Optional warning strings.
 * @param {Object} [opts.details={}]
 * @returns {Object} FAIL-shaped gate result.
 */
export function buildFailResult({
  score = 0,
  max_score = 100,
  issues = [],
  remediation,
  warnings,
  details = {},
} = {}) {
  const result = {
    passed: false,
    wait: false,
    score,
    max_score,
    issues,
    warnings: Array.isArray(warnings) ? warnings : [],
    details,
  };
  if (remediation) result.remediation = remediation;
  return result;
}

/**
 * Classify a test-runner exit into 'timeout' (environmental), 'failure'
 * (real test failure / user error), or 'pass'.
 *
 * RISK-2 / TR-2: WHITELIST-based ONLY. We NEVER scan arbitrary user error text
 * for the word "timeout" — a user-thrown Error("connection timeout") is a REAL
 * failure, not an environmental one. Letting bad code through (by misclassifying
 * a failure as an environmental timeout → WAIT) is the worst outcome of this SD,
 * so the default is always 'failure'/'pass', never 'timeout'.
 *
 * Environmental-timeout whitelist (the ONLY things that map to 'timeout'):
 *   - Exit codes: 124 (GNU coreutils `timeout`), 137 (SIGKILL/128+9 OOM-kill),
 *     143 (SIGTERM/128+15)
 *   - vitest `--reporter=json` duration timeout markers
 *   - jest:       "Timeout - Async callback was not invoked"
 *   - playwright: "Test timeout of <N>ms exceeded"
 *
 * @param {number} exitCode - Process exit code from the test runner.
 * @param {string} [stderrOrMessage=''] - Captured stderr / error message.
 * @returns {'timeout'|'failure'|'pass'}
 */
export function classifyTestRunnerExit(exitCode, stderrOrMessage = '') {
  const code = Number(exitCode);

  // Environmental-timeout exit codes (whitelist).
  if (code === 124 || code === 137 || code === 143) {
    return 'timeout';
  }

  const text = String(stderrOrMessage || '');

  // Strict runner-emitted environmental-timeout markers (whitelist).
  // These are framework-controlled strings, NOT arbitrary user error text.
  const ENV_TIMEOUT_MARKERS = [
    // jest async-callback timeout
    /Timeout - Async callback was not invoked/,
    // playwright per-test timeout: "Test timeout of 30000ms exceeded"
    /Test timeout of \d+ms exceeded/,
    // vitest hook/test timeout: "Test timed out in 5000ms." / "Hook timed out in 5000ms."
    /(?:Test|Hook) timed out in \d+ms/,
    // vitest --reporter=json duration-timeout marker
    /"reason"\s*:\s*"timeout"/,
  ];
  for (const marker of ENV_TIMEOUT_MARKERS) {
    if (marker.test(text)) return 'timeout';
  }

  // Exit code 0 with no environmental marker → pass.
  if (code === 0) return 'pass';

  // Anything else (assertion errors, user-thrown errors whose messages merely
  // contain "timeout", unknown non-zero exits) → real failure. NEVER 'timeout'.
  return 'failure';
}

/**
 * Parse a timestamp treating naive (no-TZ) strings as UTC, matching the
 * convention used by subagent-evidence-gate.js (PostgREST returns
 * timestamp-without-time-zone as naive strings; new Date() would parse them
 * as LOCAL and skew the comparison).
 *
 * @param {string|Date|number} ts
 * @returns {Date|null}
 */
function parseAsUTC(ts) {
  if (ts === null || ts === undefined) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === 'number') return new Date(ts);
  const s = String(ts);
  const hasTZ = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
  return new Date(hasTZ ? s : s + 'Z');
}

/**
 * Whether `now - startedAt` is within `windowSeconds` (i.e. still inside the
 * race window). Used by the SUB_AGENT_EVIDENCE gate (30s race window) and any
 * other time-bounded race-window check.
 *
 * Defensive: a missing/unparseable startedAt returns false (outside window →
 * the caller FAILs rather than WAITs forever — safe default).
 *
 * @param {string|Date|number} startedAtIso
 * @param {number} windowSeconds
 * @param {Date|number} [now=Date.now()] - Injectable clock for tests.
 * @returns {boolean}
 */
export function isWithinRaceWindow(startedAtIso, windowSeconds, now = Date.now()) {
  const started = parseAsUTC(startedAtIso);
  if (!started || Number.isNaN(started.getTime())) return false;
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const elapsedSec = (nowMs - started.getTime()) / 1000;
  if (Number.isNaN(elapsedSec)) return false;
  return elapsedSec <= Number(windowSeconds);
}

/**
 * Decide whether a gate that keeps returning WAIT has exceeded the safety
 * ceiling and must now escalate to a real FAIL (TR-4 / FR-5 / RISK-3).
 *
 * Two independent caps (either one trips):
 *   - wait_attempts >= maxAttempts          → WAIT_LIMIT_EXCEEDED
 *   - now - first_wait_at >= maxWallClockMs → WAIT_TIMEOUT_EXCEEDED
 *
 * @param {Object} opts
 * @param {number} [opts.wait_attempts=0] - Count of consecutive WAITs SO FAR
 *   (i.e. before the current attempt). With maxAttempts=10, a value of 10 means
 *   10 prior waits already happened, so the 11th attempt must FAIL.
 * @param {string|Date|number} [opts.first_wait_at] - Timestamp of the first WAIT.
 * @param {number} [opts.maxAttempts=10]
 * @param {number} [opts.maxWallClockMs=86400000] - 24h.
 * @param {Date|number} [opts.now=Date.now()] - Injectable clock for tests.
 * @returns {{ exceeded:boolean, reason:('WAIT_LIMIT_EXCEEDED'|'WAIT_TIMEOUT_EXCEEDED'|null) }}
 */
export function hasExceededMaxWait({
  wait_attempts = 0,
  first_wait_at,
  maxAttempts = 10,
  maxWallClockMs = 24 * 60 * 60 * 1000,
  now = Date.now(),
} = {}) {
  const attempts = Number(wait_attempts) || 0;
  if (attempts >= maxAttempts) {
    return { exceeded: true, reason: 'WAIT_LIMIT_EXCEEDED' };
  }

  const first = parseAsUTC(first_wait_at);
  if (first && !Number.isNaN(first.getTime())) {
    const nowMs = now instanceof Date ? now.getTime() : Number(now);
    if (nowMs - first.getTime() >= maxWallClockMs) {
      return { exceeded: true, reason: 'WAIT_TIMEOUT_EXCEEDED' };
    }
  }

  return { exceeded: false, reason: null };
}

export default {
  buildWaitResult,
  buildFailResult,
  classifyTestRunnerExit,
  isWithinRaceWindow,
  hasExceededMaxWait,
};
