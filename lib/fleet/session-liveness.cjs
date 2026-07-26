// SD-LEO-INFRA-IS-ALIVE-LIVENESS-SSOT-001 — single READ-TIME session-liveness SSOT.
//
// claude_sessions.is_alive is a RAW STORED boolean written only by heartbeat-manager
// (true@start / false@stop) + the sweep's release. The heartbeat interval is UNREF'd so a
// parked worker (long ScheduleWakeup / awaiting_tick) stops firing it and is_alive FREEZES at
// its last value while the OS process is still alive — a false-negative that has driven false
// "fleet down" / "orphaned SD" verdicts FOUR times (P(alive) gauge #5095, charter-audit DUTY-3,
// ghost-detector #5090, and the 2026-06-23 near-reap). A correct write-time fix is infeasible
// (the staleness arises AFTER the last write), so the only durable root fix is this: reconcile
// the raw flag against AUTHORITATIVE signals at READ time, used by EVERY consumer.
//
// ONE-DIRECTIONAL CONTRACT: isSessionAlive can only ever read MORE-alive than the raw flag — it
// treats raw is_alive===true as a live signal, so it NEVER downgrades a worker the raw flag calls
// alive (never masks a real death). It only UPGRADES a parked-alive worker (raw says dead/frozen
// but an authoritative signal says alive) to alive, with a stamped reason.
//
// CJS so it can require() cc-pid-liveness.cjs and be require()'d by the CJS consumers
// (fleet-dashboard.cjs, worker-checkin.cjs); ESM consumers (claim-validity-gate.js,
// ownership-detection.js) load it via createRequire / import interop.

const { isProcessRunning } = require('./cc-pid-liveness.cjs');
const { resolveCcPidFromTerminalId } = require('./resolve-cc-pid.cjs');

const LIVENESS_HEARTBEAT_SEC = 300;        // heartbeat fresher than 5min → alive
const TICK_FRESH_MS = 90 * 1000;           // process_alive_at within 90s → alive
const ARMED_SILENCE_MAX_MS = 30 * 60 * 1000; // expected_silence_until within 30min → parked-alive

function _ageMs(ts, nowMs) {
  if (ts == null) return Infinity;
  const t = typeof ts === 'number' ? ts : Date.parse(ts);
  if (!Number.isFinite(t)) return Infinity;
  return nowMs - t;
}

// Heartbeat fresher than LIVENESS_HEARTBEAT_SEC. Accepts heartbeat_at | last_heartbeat | heartbeat_age_seconds.
function hasFreshHeartbeat(session, nowMs) {
  if (!session) return false;
  if (typeof session.heartbeat_age_seconds === 'number') return session.heartbeat_age_seconds < LIVENESS_HEARTBEAT_SEC;
  const ts = session.heartbeat_at ?? session.last_heartbeat;
  return _ageMs(ts, nowMs) < LIVENESS_HEARTBEAT_SEC * 1000;
}

// Fresh process tick (the source-side liveness stamp), within TICK_FRESH_MS.
function hasTickAlive(session, nowMs) {
  if (!session || !session.process_alive_at) return false;
  return _ageMs(session.process_alive_at, nowMs) <= TICK_FRESH_MS;
}

// Inside an armed expected_silence_until window (future, but capped at ARMED_SILENCE_MAX_MS out).
function hasExpectedSilence(session, nowMs) {
  if (!session || !session.expected_silence_until) return false;
  const delta = (typeof session.expected_silence_until === 'number'
    ? session.expected_silence_until
    : Date.parse(session.expected_silence_until)) - nowMs;
  return Number.isFinite(delta) && delta > 0 && delta <= ARMED_SILENCE_MAX_MS;
}

// Live OS process via the SessionStart PID markers.
//
// SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (C2): this used to do
// String(terminal_id).split('-') and take the LAST segment, which assumed the
// "win-cc-{port}-{ccPid}" form. Sessions actually write BARE UUIDs, whose last segment is a hex
// group (e.g. "07ab028225c9") and never a PID — so this leg resolved 0 of 22 live rows and the
// whole PID rung of the ladder was inert. It now uses the shared three-format resolver
// (lib/fleet/resolve-cc-pid.cjs), the same one scripts/stale-session-sweep.cjs uses, which
// additionally maps a UUID terminal_id through the pid-*.json markers via session_id.
//
// DIRECTION OF CHANGE: this can only ever return TRUE more often than before, never less — it
// adds resolvable formats and removes none. That keeps it an UPGRADE-ONLY change under the
// one-directional contract documented at the top of this file, so it is safe to land alone,
// ahead of any predicate amendment.
//
// A null resolution means COULD NOT DETERMINE (no terminal_id, unknown format, or no marker) —
// it returns false meaning "this leg does not assert alive", which the OR-ladder treats as
// abstention. It must never be read as a positive "the process is dead".
//
// aliveCcPids may be injected (Set of alive cc pid strings); otherwise liveness is checked
// against the live OS via isProcessRunning.
function hasPidAlive(session, aliveCcPids) {
  // Deliberately does NOT early-return on a missing terminal_id: the resolver can still match a
  // pid-*.json marker by session_id, and 3 of the 12 live sessions (including the coordinator)
  // have terminal_id NULL with a resolvable marker. Bailing here would discard a real answer.
  if (!session || (!session.terminal_id && !session.session_id)) return false;
  const pid = resolveCcPidFromTerminalId(session.terminal_id, session.session_id);
  if (pid == null) return false;
  if (aliveCcPids) return aliveCcPids.has(String(pid));
  return isProcessRunning(pid);
}

/**
 * The READ-TIME liveness SSOT. Returns { alive, reason }.
 * alive = raw is_alive===true OR fresh heartbeat OR live PID OR fresh tick OR armed-silence.
 * One-directional: a raw-alive session is always alive (reason 'raw_is_alive'); a parked session
 * the raw flag froze to false is UPGRADED to alive iff an authoritative signal fires (with that
 * signal as the reason). Never returns alive=false for a session the raw flag calls alive.
 *
 * @param {object|null} session - a claude_sessions-shaped row (or v_active_sessions row)
 * @param {{nowMs?:number, aliveCcPids?:Set<string>}} [opts]
 * @returns {{alive:boolean, reason:(string|null)}}
 */
function isSessionAlive(session, { nowMs = Date.now(), aliveCcPids = null } = {}) {
  if (!session) return { alive: false, reason: null };
  if (session.is_alive === true) return { alive: true, reason: 'raw_is_alive' };
  if (hasFreshHeartbeat(session, nowMs)) return { alive: true, reason: 'fresh_heartbeat' };
  if (hasPidAlive(session, aliveCcPids)) return { alive: true, reason: 'pid_alive' };
  if (hasTickAlive(session, nowMs)) return { alive: true, reason: 'process_tick' };
  if (hasExpectedSilence(session, nowMs)) return { alive: true, reason: 'armed_silence' };
  return { alive: false, reason: null };
}

module.exports = {
  isSessionAlive,
  hasFreshHeartbeat,
  hasTickAlive,
  hasExpectedSilence,
  hasPidAlive,
  LIVENESS_HEARTBEAT_SEC,
  TICK_FRESH_MS,
  ARMED_SILENCE_MAX_MS,
};
