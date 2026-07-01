'use strict';

/**
 * Shared adaptive communication cadence — SD-LEO-INFRA-ADAPTIVE-COMMS-CADENCE-SHARED-PROTOCOL-001.
 *
 * Role-sessions (Adam, coordinator, Solomon) and workers drain their inboxes / re-check on a
 * FIXED cadence. That's fine when quiet, but during a live back-and-forth it adds one full
 * baseline interval of latency PER hop. This module is the single shared, pure decision that
 * ANY session calls to compute its own next self-scheduled check-in interval: TIGHT while a
 * thread is genuinely open, BASELINE when quiet, capped so a never-resolving thread can't pin a
 * session in tight-poll forever (defeating cycle-down).
 *
 * Pattern mirrors lib/hooks/auto-signal-threshold.cjs: a PURE decision function (no I/O,
 * unit-testable in isolation) plus a companion I/O helper that gathers the signals. Tightening
 * happens via SELF-SCHEDULED RE-CHECK (each caller reads the recommendation and re-arms its own
 * next wakeup) — a CronCreate-armed cadence can't be retuned mid-flight from Node, so this is
 * layered on top of the baseline-armed cron, not a replacement for it.
 */

const DEFAULT_TIGHT_MS = 150000; // 2.5 min
const DEFAULT_BASELINE_MS = 900000; // 15 min
const DEFAULT_CAP_MS = 1800000; // 30 min — hard ceiling on how long tight-poll can persist
const DEFAULT_RECENT_ACTIVITY_WINDOW_MS = 300000; // 5 min

/**
 * PURE: compute the next check-in interval from pre-gathered signals.
 * @param {object} o
 * @param {boolean} [o.sentPendingReply] - this session sent a reply_requested=true message with no reply yet
 * @param {boolean} [o.receivedUnactioned] - a message awaiting this session's response arrived recently
 * @param {number} [o.lastActivityMs] - timestamp (ms) of the most recent bidirectional activity
 * @param {number} [o.threadOpenedAtMs] - timestamp (ms) the active thread first opened (for cap enforcement)
 * @param {number} [o.nowMs] - current time in ms (defaults to Date.now())
 * @param {{ tightIntervalMs?: number, baselineIntervalMs?: number, capMs?: number, recentActivityWindowMs?: number }} [o.opts]
 * @returns {{ intervalMs: number, reason: string, tight: boolean }}
 */
function computeAdaptiveCadence({
  sentPendingReply = false,
  receivedUnactioned = false,
  lastActivityMs,
  threadOpenedAtMs,
  nowMs,
  opts = {},
} = {}) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const tightMs = Number.isFinite(opts.tightIntervalMs) ? opts.tightIntervalMs : DEFAULT_TIGHT_MS;
  const baselineMs = Number.isFinite(opts.baselineIntervalMs) ? opts.baselineIntervalMs : DEFAULT_BASELINE_MS;
  const capMs = Number.isFinite(opts.capMs) ? opts.capMs : DEFAULT_CAP_MS;
  const recentWindowMs = Number.isFinite(opts.recentActivityWindowMs)
    ? opts.recentActivityWindowMs
    : DEFAULT_RECENT_ACTIVITY_WINDOW_MS;

  const recentActivity = Number.isFinite(lastActivityMs) && now - lastActivityMs < recentWindowMs;
  const hasActiveSignal = sentPendingReply || receivedUnactioned || recentActivity;

  if (!hasActiveSignal) {
    return { intervalMs: baselineMs, reason: 'no_active_thread', tight: false };
  }

  // Cap enforcement: a thread open longer than capMs falls back to baseline regardless of the
  // active signal, so a never-resolving thread can't pin a session in tight-poll indefinitely.
  const openedAt = Number.isFinite(threadOpenedAtMs) ? threadOpenedAtMs : now;
  if (now - openedAt >= capMs) {
    return { intervalMs: baselineMs, reason: 'cap_exceeded', tight: false };
  }

  const reason = sentPendingReply
    ? 'sent_pending_reply'
    : receivedUnactioned
      ? 'received_unactioned'
      : 'recent_activity';
  return { intervalMs: tightMs, reason, tight: true };
}

/**
 * Gather the live session_coordination signals computeAdaptiveCadence expects. FAIL-OPEN: any
 * DB error resolves to signals that compute to BASELINE — a query failure must never pin a
 * session in tight-poll, and must never throw into the caller's tick.
 * @param {object} supabase - service-role client
 * @param {string} sessionId - this session's id
 * @param {{ nowMs?: number, recentActivityWindowMs?: number }} [opts]
 * @returns {Promise<{ sentPendingReply: boolean, receivedUnactioned: boolean, lastActivityMs: number|undefined, threadOpenedAtMs: number|undefined }>}
 */
async function getCommsActivitySignals(supabase, sessionId, opts = {}) {
  const fallback = { sentPendingReply: false, receivedUnactioned: false, lastActivityMs: undefined, threadOpenedAtMs: undefined };
  if (!supabase || !sessionId) return fallback;

  const now = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const windowMs = Number.isFinite(opts.recentActivityWindowMs) ? opts.recentActivityWindowMs : DEFAULT_RECENT_ACTIVITY_WINDOW_MS;
  const sinceIso = new Date(now - windowMs).toISOString();

  try {
    const [sentRes, receivedRes] = await Promise.all([
      supabase
        .from('session_coordination')
        .select('id, created_at, payload')
        .eq('sender_session', sessionId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('session_coordination')
        .select('id, created_at')
        .eq('target_session', sessionId)
        .is('acknowledged_at', null)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    if (sentRes.error || receivedRes.error) return fallback;

    const sentRows = Array.isArray(sentRes.data) ? sentRes.data : [];
    const repliedToIds = new Set(
      sentRows
        .map((r) => r && r.payload && r.payload.reply_to)
        .filter((v) => typeof v === 'string')
    );
    const pendingSent = sentRows.find(
      (r) => r && r.payload && r.payload.reply_requested === true && !repliedToIds.has(r.id)
    );

    const receivedRows = Array.isArray(receivedRes.data) ? receivedRes.data : [];
    const receivedUnactioned = receivedRows.length > 0;

    const timestamps = []
      .concat(sentRows.slice(0, 1).map((r) => r.created_at))
      .concat(receivedRows.map((r) => r.created_at))
      .filter(Boolean)
      .map((t) => new Date(t).getTime());
    const lastActivityMs = timestamps.length ? Math.max(...timestamps) : undefined;

    const threadOpenedAtMs = pendingSent
      ? new Date(pendingSent.created_at).getTime()
      : receivedUnactioned
        ? new Date(receivedRows[receivedRows.length - 1].created_at).getTime()
        : undefined;

    return {
      sentPendingReply: Boolean(pendingSent),
      receivedUnactioned,
      lastActivityMs,
      threadOpenedAtMs,
    };
  } catch {
    return fallback; // fail-open
  }
}

module.exports = {
  computeAdaptiveCadence,
  getCommsActivitySignals,
  DEFAULT_TIGHT_MS,
  DEFAULT_BASELINE_MS,
  DEFAULT_CAP_MS,
  DEFAULT_RECENT_ACTIVITY_WINDOW_MS,
};
