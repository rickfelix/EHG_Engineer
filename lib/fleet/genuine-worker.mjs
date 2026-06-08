// SD-FDBK-FIX-COORDINATOR-AUDIT-MJS-001 — single source of truth for "is this
// claude_sessions row a GENUINE fleet worker", so the coordinator audit, the
// executive email, and the dashboard never disagree on the worker count.
//
// Extracted verbatim from coordinator-email-summary.mjs (QF-20260607-608), which
// itself mirrors fleet-dashboard.cjs's worker-set QA. The bug this closes: each
// consumer had its own inline copy and they drifted — coordinator-audit.mjs counted
// every session heartbeating <15m regardless of role/status/claim-history, so its
// FLOW/LIVENESS gauges over-counted Adam, non_fleet, released, and never-claimed
// (ghost) sessions.
//
// A genuine worker is:
//   1. NOT the coordinator, NOT Adam (metadata.role==='adam'), NOT non_fleet;
//   2. live by status — only 'active'/'idle' (released/exited/stale are warm ghosts);
//   3. has EVER held a claim (everClaimed) — drops transient sessions that registered
//      but never claimed.

/** Ghost-filter: has this session ever held a claim? */
export const everClaimed = (s) =>
  !!(s.sd_key || s.claimed_at || s.worktree_path || (s.continuous_sds_completed > 0));

/**
 * Is this claude_sessions row a genuine fleet worker (excluding the coordinator)?
 * @param {object} s - claude_sessions row (needs session_id, status, metadata, and the everClaimed columns)
 * @param {string} coordinatorId - the active coordinator's session_id (excluded)
 */
export const isFleetWorker = (s, coordinatorId) =>
  s.session_id !== coordinatorId &&
  s.metadata?.role !== 'adam' &&
  !s.metadata?.non_fleet &&
  ['active', 'idle'].includes(s.status) &&
  everClaimed(s);

/**
 * Filter a list of sessions to the LIVE genuine workers (genuine + heartbeat within window).
 * @param {Array<object>} sessions
 * @param {string} coordinatorId
 * @param {number} nowMs - current time in ms
 * @param {number} [windowMs=900000] - liveness window (default 15 min, matches the sweep)
 */
export const liveFleetWorkers = (sessions, coordinatorId, nowMs, windowMs = 900000) =>
  (sessions || []).filter(
    (s) =>
      isFleetWorker(s, coordinatorId) &&
      s.heartbeat_at &&
      nowMs - new Date(s.heartbeat_at).getTime() < windowMs
  );
