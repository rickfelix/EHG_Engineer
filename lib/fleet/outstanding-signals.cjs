// SD-FDBK-INFRA-WORKER-VISIBLE-UNACKED-001 — the worker-visible unacked-age surface.
//
// A worker can send a signal into the coordination lane and have no way, from inside its
// own loop, to learn that nobody answered it. This is the buildable half of the
// answered-rate gap: given a session, return ITS OWN outstanding signals with age, so a
// worker observes the fact from its own check-in with no human and no coordinator action.
//
// THE PREDICATE IS acknowledged_at, AND THE OBVIOUS CHOICE IS WRONG.
// `read_at` is set by the SWEEP and means DELIVERED (transport). The two-stage ACK
// contract is stated verbatim at lib/coordinator/adam-action-ack.cjs:26, and :116
// implements DELIVERED as a bare `!!msg.read_at`. The ACTION ack is `acknowledged_at`.
// Measured on one live session while writing this: 22 signals sent, 3 unacked — and TWO
// of the three had read_at SET with acknowledged_at NULL. A read_at-keyed surface would
// have reported 3 outstanding as 1 and called the gap two-thirds closed. That is the
// majority of the sample, not an edge case, which is why `delivered` is surfaced per-row
// instead of collapsing both states into one "outstanding" bucket.
//
// READ-ONLY, DELIBERATELY AND LOAD-BEARINGLY.
// /checkin is the ONLY path in the fleet that stamps ack state (ackMessage,
// scripts/worker-checkin.cjs). This module runs inside that command and writes NOTHING.
// A surface that acknowledged its own report would erase the evidence it exists to
// expose, and the fleet answered-rate metric would climb PRECISELY BECAUSE nobody
// answered — inverting while reading as progress.
//
// FAILS QUIET, NOT CLOSED. This is an informational surface, not a guard. If the query
// errors, emit nothing and let the check-in proceed: a check-in that failed because it
// could not compute a nudge would take down the one command that drains coordinator
// messages, fleet-wide. That is the opposite posture from the worktree deletion guards,
// and the difference is the consequence of being wrong.

/** Oldest-first list cap. The cap must drop the NEWEST rows — see fetch(). */
// SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 (FR-9): distinguish router-filed from never-touched.
const { isPromotionAcked } = require('../coordinator/promotion-ack.cjs');

const DEFAULT_LIST_CAP = 5;
/** Age at which the surface also emits a human-readable line, not just the array. */
const DEFAULT_ALERT_AGE_MIN = 30;

function ageMinutes(createdAt, nowMs) {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((nowMs - t) / 60000));
}

/**
 * Shared core: outstanding (unacknowledged) signal rows, optionally scoped to one sender.
 * SD-LEO-INFRA-SIGNAL-LANE-PER-001 (FR-2): extracted so the coordinator-wide view
 * (fetchAllOutstandingSignals) and the worker-self view (fetchOutstandingSignals) share one
 * query/shape instead of the coordinator tick growing its own separate, un-tested duplicate.
 *
 * @param {object} sb
 * @param {{sessionId?: string, cap?: number, nowMs?: number}} opts - sessionId omitted = coordinator-wide (ALL senders)
 */
async function _fetchOutstanding(sb, opts = {}) {
  const { sessionId = null, cap = DEFAULT_LIST_CAP, nowMs = Date.now() } = opts;
  if (!sb) return null;
  try {
    // sender_session is the scoping column. There is NO from_session_id column — that is
    // the first name an implementer reaches for and it errors loudly ("column
    // session_coordination.from_session_id does not exist"), which is the good failure.
    //
    // payload->>signal_type restricts to the friction lane a worker actually sends on
    // (set at worker-signal.cjs write time). roll_call and consult rows are deliberately
    // excluded: they are not questions awaiting an answer, and counting them as
    // "unanswered" would make every worker permanently alarmed about its own heartbeat.
    //
    // ORDER created_at ASC is load-bearing with `cap`: the oldest unanswered signal is
    // the one that matters, so truncation must drop the NEWEST. A newest-first list cut
    // at N hides exactly the rows that have been ignored longest.
    //
    // count:'exact' with .limit() gives the TRUE total alongside a bounded list, so a
    // truncated list can never be mistaken for a complete one.
    let query = sb
      .from('session_coordination')
      .select('id, created_at, read_at, payload', { count: 'exact' });
    // sessionId absent = coordinator-wide (FR-2's fetchAllOutstandingSignals); present = the
    // original worker-self scoping. Must run BEFORE .limit() — some query-builder doubles (and
    // PostgREST's own client) resolve/settle at the final chained call, so a filter appended
    // after .limit() would silently no-op or throw depending on the implementation.
    if (sessionId) query = query.eq('sender_session', sessionId);
    query = query
      .not('payload->>signal_type', 'is', null)
      // SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 (FR-9), the SENDER side of the same defect.
      // The router used to ack on promotion, so a promoted signal silently left this banner too:
      // the sender saw "delivered", the coordinator saw nothing, and neither end had a surface
      // showing the gap. Now that promotion no longer acks, these rows correctly REMAIN here —
      // they genuinely are unanswered — but they are annotated below rather than shown as
      // identical to a never-routed signal, because "filed, awaiting disposition" and "nobody has
      // touched this at all" are two different states that were wearing one stamp.
      .is('acknowledged_at', null)
      .order('created_at', { ascending: true });

    const { data, error, count } = await query.limit(cap);

    if (error) return null;                       // fail QUIET
    const rows = data || [];
    if (rows.length === 0) return null;           // quiet when empty — no stub, see below

    const signals = rows.map((r) => ({
      id: r.id,
      signal_type: (r.payload || {}).signal_type || null,
      created_at: r.created_at,
      age_minutes: ageMinutes(r.created_at, nowMs),
      // Surfaced, not collapsed: delivered-but-unanswered is the state that a read_at
      // predicate silently swallows, and the worker should be able to see the difference.
      delivered: !!r.read_at,
      // Same principle, one state further along (SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 FR-9):
      // "the router filed this into a backlog row, nobody has dispositioned it yet" is not the
      // same as "nobody has touched this at all". Both are legitimately unanswered and both
      // belong in this list — but collapsing them is what let a promoted signal read as handled.
      routed: isPromotionAcked(r),
    }));

    return {
      count: Number.isFinite(count) ? count : signals.length,   // TRUE total
      shown: signals.length,
      // Optional-chained DELIBERATELY. Written as signals[0].age_minutes this THROWS on
      // an empty list and the fail-quiet catch below returns null — the same observable
      // answer as the early return above, by accident. That made the quiet-when-empty
      // guard invisible: a mutation removing it survived, because control flow fell
      // through an exception instead. Not relying on the throw makes the guard
      // load-bearing (remove it and an empty stub escapes, which is exactly the thing
      // this surface must never emit) and keeps exceptions out of the happy path.
      oldest_age_minutes: signals[0]?.age_minutes ?? null,
      signals,
    };
  } catch {
    return null;                                  // fail QUIET
  }
}

/**
 * Outstanding (unacknowledged) signals SENT BY this session.
 *
 * @param {object} sb - injected Supabase client; never constructed here (testability)
 * @param {string} sessionId
 * @param {object} [opts]
 * @param {number} [opts.cap=5]
 * @param {number} [opts.nowMs=Date.now()]
 * @returns {Promise<null|{count:number, shown:number, oldest_age_minutes:number, signals:Array}>}
 *          null when there is nothing outstanding — see the quiet-when-empty note below.
 */
async function fetchOutstandingSignals(sb, sessionId, opts = {}) {
  if (!sessionId) return null;
  return _fetchOutstanding(sb, { ...opts, sessionId });
}

/**
 * SD-LEO-INFRA-SIGNAL-LANE-PER-001 (FR-2): the SAME oldest-first, truncation-honest,
 * fail-quiet surface as fetchOutstandingSignals, but coordinator-wide (every sender), for
 * the coordinator's own inbox tick — "a 2.5h latency is visible at the tick, not discovered
 * in retro." Reuses DEFAULT_ALERT_AGE_MIN as its SLA threshold rather than introducing a
 * second, rival constant for the same concept (TESTING correction, fd168314).
 *
 * @param {object} sb
 * @param {{cap?: number, nowMs?: number}} [opts]
 */
async function fetchAllOutstandingSignals(sb, opts = {}) {
  return _fetchOutstanding(sb, opts);
}

/**
 * One-line human-readable warning, or null when the oldest signal is under the threshold.
 *
 * Returning null below the threshold (rather than a cheerful "0 stale") is deliberate:
 * this runs once per loop iteration per seat across the whole fleet, and a line that is
 * always present is a line workers learn to skim past — including on the one pass where
 * it matters.
 */
function formatOutstandingWarning(result, opts = {}) {
  const { alertAgeMin = DEFAULT_ALERT_AGE_MIN } = opts;
  if (!result || !result.count) return null;
  if (!Number.isFinite(result.oldest_age_minutes) || result.oldest_age_minutes < alertAgeMin) return null;
  const truncated = result.count > result.shown ? ` (showing oldest ${result.shown})` : '';
  // SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 (FR-9): surface the routed count. Annotating each row
  // with `routed` while leaving this sentence unchanged would have added a field nobody reads —
  // the same shape as a marker written but never consumed, which is the defect this SD is about.
  const routed = (result.signals || []).filter((s) => s.routed).length;
  const routedNote = routed > 0
    ? ` ${routed} of the shown signal(s) were FILED by the router into a backlog row and are awaiting disposition — filed is not answered.`
    : '';
  return `⚠ ${result.count} signal(s) you sent are still UNANSWERED${truncated} — oldest ${result.oldest_age_minutes}m. `
    + 'Unacked means acknowledged_at is null; some may already be delivered (read) but not actioned.'
    + routedNote;
}

/**
 * SD-LEO-INFRA-SIGNAL-LANE-PER-001 (FR-2): coordinator-facing wording for fetchAllOutstandingSignals'
 * result — "you sent" (formatOutstandingWarning's wording) is wrong on the coordinator's own tick,
 * since the coordinator didn't send these signals, it owes them a disposition.
 */
function formatCoordinatorOverdueWarning(result, opts = {}) {
  const { alertAgeMin = DEFAULT_ALERT_AGE_MIN } = opts;
  if (!result || !result.count) return null;
  if (!Number.isFinite(result.oldest_age_minutes) || result.oldest_age_minutes < alertAgeMin) return null;
  const truncated = result.count > result.shown ? ` (showing oldest ${result.shown})` : '';
  return `⚠ ${result.count} signal(s) are UNDISPOSITIONED${truncated} — oldest ${result.oldest_age_minutes}m `
    + `(SLA: ${alertAgeMin}m). Unacked means acknowledged_at is null; dispose via coordinator-ack-signal.cjs.`;
}

module.exports = {
  fetchOutstandingSignals,
  fetchAllOutstandingSignals,
  formatOutstandingWarning,
  formatCoordinatorOverdueWarning,
  DEFAULT_LIST_CAP,
  DEFAULT_ALERT_AGE_MIN,
};
