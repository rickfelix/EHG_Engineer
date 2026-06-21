/**
 * Claim-heartbeat throttle — SD-LEO-INFRA-CLAIM-TTL-EXEC-HEARTBEAT-001.
 *
 * The shipped SD-LEO-INFRA-CLAIM-TTL-LONG-SUBAGENT-TICK-001 refreshes a worker's claim heartbeat ONLY
 * when a sub-agent writes evidence. A long EXEC build that makes NO DB write in the window (a big code
 * build / Explore with no sub-agent calls) still ages past the 900s claim TTL and gets reaped + stolen.
 * This adds a TIME-based heartbeat: a PostToolUse hook refreshes the claim on tool activity, THROTTLED
 * by this pure decision so we touch the DB at most once per window (not on every keystroke-level call).
 *
 * CommonJS (.cjs) so the .cjs PostToolUse hook can require it under the repo's package.json type=module.
 * @module lib/claim/heartbeat-throttle
 */

/** Default: refresh at most once per 120s — comfortably inside the 900s TTL even across slow tool gaps. */
const DEFAULT_THROTTLE_MS = 120_000;

/**
 * Decide whether to refresh the claim heartbeat now. PURE.
 * Refresh when we've never touched (lastTouchMs null/undefined/non-finite) or the last touch is at least
 * throttleMs old. A future/garbage lastTouchMs (clock skew) refreshes too — failing toward keeping the
 * claim alive is the SAFE direction (an extra write costs nothing; a missed heartbeat costs a reap+steal).
 *
 * @param {number|null|undefined} lastTouchMs - epoch ms of the last heartbeat write (null if never)
 * @param {number} nowMs - current epoch ms
 * @param {number} [throttleMs=DEFAULT_THROTTLE_MS]
 * @returns {boolean}
 */
function shouldRefreshHeartbeat(lastTouchMs, nowMs, throttleMs = DEFAULT_THROTTLE_MS) {
  if (lastTouchMs == null || !Number.isFinite(lastTouchMs)) return true; // never touched -> refresh
  const elapsed = nowMs - lastTouchMs;
  if (!Number.isFinite(elapsed)) return true;
  if (elapsed < 0) return true;            // clock skew / future stamp -> safe direction = refresh
  return elapsed >= throttleMs;
}

module.exports = { shouldRefreshHeartbeat, DEFAULT_THROTTLE_MS };
