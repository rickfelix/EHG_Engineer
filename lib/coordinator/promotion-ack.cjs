/**
 * promotion-ack.cjs — SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001.
 *
 * PROMOTION IS NOT DISPOSITION. The signal router used to stamp `acknowledged_at` while
 * promoting a signal into a harness_backlog feedback row. The coordinator inbox selects
 * `acknowledged_at IS NULL`, and that same inbox is what stamps `read_at` ON RENDER — so the
 * ack removed the row from the very query that would have marked it read. Measured: 9 rows,
 * 100% of everything the router had ever promoted, every one severity=critical, still firing
 * the day the SD was filed. Nothing downstream re-raised them because an acked row looks handled.
 *
 * So promotion now records WHERE a signal went and stops claiming it was HANDLED:
 *   - `payload.routed_to_feedback_id` — unchanged, still the re-aggregation dedup key.
 *   - `payload.promotion_ack` — NEW. "the router filed this; a human still has not."
 *   - `acknowledged_at` — left alone, and now means exactly one thing: a human or role
 *     dispositioned this row.
 *
 * WHY A DISTINCT KEY RATHER THAN THE EXISTING `auto_acked`. lib/retention/retention-ack-marker.cjs
 * marks retention-style machine acks with `auto_acked`, and a detector for THIS defect class must
 * be able to exclude those while still catching router promotions. Reuse one key for both and the
 * detector excludes precisely the population it exists to catch — a silent zero that looks like
 * health. The names were collision-checked before adoption: zero code references and zero live
 * rows carried `promotion_ack` / `promotion_ack_source` / `router_ack`.
 *
 * WHY THE MARKER LIVES IN `payload` AND NOT IN A NEW COLUMN. reviveArchivedSignal in
 * lib/coordinator/worker-signal-starvation.cjs rebuilds rows through an EXPLICIT field map; a new
 * column would be dropped there and archived rows would silently stop correlating. Riding inside
 * the jsonb also means no migration.
 *
 * Everything here is PURE and total — no DB access, no I/O — so the two-sided proof is an
 * in-memory unit test over crafted row objects. That is deliberate: this repo has no designated
 * non-production database (the vitest `db` project is gated off), so a classifier that could only
 * be exercised against live data could not be honestly tested at all.
 */

/** Marks a row the router filed but nobody has dispositioned. */
const PROMOTION_ACK_KEY = 'promotion_ack';
/** Provenance, so a later reader can tell WHICH automated writer set the marker. */
const PROMOTION_ACK_SOURCE_KEY = 'promotion_ack_source';
const PROMOTION_ACK_SOURCE = 'signal_router_promotion';

/**
 * Merge the promotion marker into a payload. Never mutates the input.
 * @param {object|null|undefined} payload existing row payload
 * @param {string} feedbackId the harness_backlog row this signal was promoted into
 */
function buildPromotionAckPayload(payload, feedbackId) {
  return {
    ...(payload || {}),
    routed_to_feedback_id: feedbackId,
    [PROMOTION_ACK_KEY]: true,
    [PROMOTION_ACK_SOURCE_KEY]: PROMOTION_ACK_SOURCE
  };
}

/** True when the router filed this row. Total: any shape in, boolean out. */
function isPromotionAcked(row) {
  return row?.payload?.[PROMOTION_ACK_KEY] === true;
}

/**
 * The defect predicate, and the reason it keys on ROUTER PROVENANCE rather than on the bare
 * (acknowledged_at set AND read_at null) pair.
 *
 * That bare pair is NOT the defect. scripts/coordinator-ack-signal.cjs stamps `acknowledged_at`
 * without `read_at` as the LEGITIMATE coordinator disposition path, so acked-and-unread rows will
 * always exist and "drive the count to zero" is not a reachable or desirable goal. Measured while
 * writing this: 13 rows matched the bare pair, only 9 of which were router-promoted.
 *
 * What IS the defect is a row the ROUTER retired that nobody ever read. After this SD the router
 * no longer sets `acknowledged_at`, so a row matching all three conditions means either a
 * regression here or some other writer acking a promoted row behind our back — which is exactly
 * what the stale-session-sweep STUCK-drain would have done.
 *
 * Stated as a rule rather than a count on purpose: the populations drift (the negative fixture
 * moved 176 -> 416 -> 426 over three days), so an assertion pinned to a number measures the clock.
 */
function isRouterSwallowed(row) {
  if (!row) return false;
  return Boolean(row.acknowledged_at) && !row.read_at && isPromotionAcked(row);
}

module.exports = {
  PROMOTION_ACK_KEY,
  PROMOTION_ACK_SOURCE_KEY,
  PROMOTION_ACK_SOURCE,
  buildPromotionAckPayload,
  isPromotionAcked,
  isRouterSwallowed
};
