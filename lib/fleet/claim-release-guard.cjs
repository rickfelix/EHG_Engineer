/**
 * Claim-release PID-liveness guard — SD-LEO-INFRA-STALE-SWEEP-PID-LIVENESS-GUARD-001.
 *
 * WHY: multiple INDEPENDENT release paths (the coordinator conflict-eviction sweep, the
 * compaction-recovery hooks) released an in_progress claim purely on HEARTBEAT staleness.
 * A parked-but-alive /loop worker (heartbeat stale because it is sleeping between ticks, but
 * its OS process very much alive) was swept — orphaning its in-flight SD. A heartbeat-stale
 * worker whose PID is ALIVE is recoverable, NOT abandoned; only a genuinely dead PID (or a
 * claim stale beyond a much longer hard-abandonment ceiling) should be released.
 *
 * This is the single guard those release sites consult before clearing a claim. It is a thin,
 * pure wrapper over the read-time liveness SSOT (lib/fleet/session-liveness.cjs isSessionAlive),
 * so "alive" means exactly what every other consumer means by it (raw is_alive | fresh heartbeat
 * | live PID | fresh tick | armed expected-silence). No new threshold is invented here.
 *
 * FR-2 (guard): shouldHoldClaim() returns hold=true when the holder is alive.
 * FR-3 (observability): callers emit a clear SKIP log using the returned reason.
 */
const { isSessionAlive } = require('./session-liveness.cjs');

/**
 * Decide whether a stale-heartbeat claim must be HELD (not released) because its holder is alive.
 *
 * @param {object|null} session - a claude_sessions-shaped row. For an accurate verdict it should
 *   carry the fields the SSOT reads: is_alive, heartbeat_at, terminal_id (PID is the last
 *   hyphen-segment), process_alive_at, expected_silence_until.
 * @param {{aliveCcPids?:Set<string>|null}} [opts] - optional pre-computed alive-PID set (the sweep
 *   already has one); when omitted the SSOT reads the host PID markers fresh.
 * @returns {{hold:boolean, reason:(string|null)}} hold=true => do NOT release; reason is the
 *   liveness signal that vouched for the holder (e.g. 'pid_alive', 'fresh_heartbeat').
 */
function shouldHoldClaim(session, { aliveCcPids = null } = {}) {
  const verdict = isSessionAlive(session, { aliveCcPids });
  return { hold: verdict.alive === true, reason: verdict.reason };
}

module.exports = { shouldHoldClaim };
