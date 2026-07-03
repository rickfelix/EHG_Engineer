/**
 * Fleet worker dormancy detector — QF-20260703-076.
 *
 * RCA: prior backstops (loop directive Step-6, stop-loop-wakeup-reminder.cjs) run INSIDE
 * a turn, so none can observe a worker that armed a ScheduleWakeup and then never got
 * another turn. This is the missing session-independent detector.
 *
 * Keys on process_alive_at, NOT heartbeat_at — heartbeat_at is rewritten by multiple
 * writers independently of real work (verified live: session cb2bfe72 showed a fresh
 * heartbeat_at while process_alive_at was 24+ hours stale). Detector-only: does NOT
 * revive workers (worker-spawn-executor.cjs stays behind its own operator gate).
 */
'use strict';

const { SILENCE_HARD_CAP_MS } = require('./silence-cap.cjs');

// Avoid flagging a worker that just woke up and is mid-tick, racing the detector.
const ELAPSED_GRACE_MS = 3 * 60 * 1000;
// process_alive_at older than this (or absent) counts as stale.
const PROCESS_ALIVE_STALE_MS = 5 * 60 * 1000;
const DORMANT_LOOP_STATES = new Set(['awaiting_tick', 'active']);

/** Pure: is a single session dormant per the corrected reachability predicate? */
function isDormant(session, nowMs) {
  if (!session || !DORMANT_LOOP_STATES.has(session.loop_state)) return false;
  const esu = session.expected_silence_until ? Date.parse(session.expected_silence_until) : NaN;
  if (Number.isNaN(esu) || nowMs - esu < ELAPSED_GRACE_MS) return false;
  const paa = session.process_alive_at ? Date.parse(session.process_alive_at) : NaN;
  if (!Number.isNaN(paa) && nowMs - paa < PROCESS_ALIVE_STALE_MS) return false;
  return true;
}

/** Pure: detect dormant workers across a session list. */
function detectDormantWorkers(sessions, nowMs) {
  return (sessions || [])
    .filter((s) => isDormant(s, nowMs))
    .map((s) => ({ session_id: s.session_id, elapsed_ms: nowMs - Date.parse(s.expected_silence_until) }));
}

module.exports = { detectDormantWorkers, isDormant, ELAPSED_GRACE_MS, PROCESS_ALIVE_STALE_MS, SILENCE_HARD_CAP_MS };
