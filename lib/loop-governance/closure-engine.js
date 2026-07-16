/**
 * Loop-governance closure engine (FR-3 core).
 * (SD-LEO-INFRA-UNIVERSAL-LOOP-GOVERNANCE-001, L-META — runtime half of D8)
 *
 * PURE module — no DB/fs. Given a loop's closure predicate + the observed evidence,
 * decide whether the loop is CLOSED, OPEN, or STARVED. This is the alarm D4 cannot
 * raise: D4 only sees operator liveness; closure means the loop's output edge
 * actually materialized, on time.
 *
 * The distinction that matters (and that a naive liveness check misses):
 *   - CLOSED  — the closure_edge is present AND fresh (within the predicate window).
 *   - OPEN    — the loop FIRED (upstream trigger observed) but the closure_edge did
 *               not materialize (or is stale). The loop is running but not closing.
 *   - STARVED — the loop's upstream never fired, so there is nothing to close. This
 *               is NOT the loop's fault; distinguishing it from OPEN prevents blaming
 *               a healthy loop for an upstream drought.
 */

export const LOOP_STATUS = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  STARVED: 'starved',
  UNKNOWN: 'unknown',
});

/**
 * Closure-predicate taxonomy. Each type names HOW closure is machine-checked; the
 * evidence shape each expects is documented inline. New loop kinds add a type here
 * (and a matching probe in the verifier's evidence collector).
 */
export const PREDICATE_TYPES = Object.freeze({
  // closure_edge is a row/artifact that must exist and be fresh
  EDGE_FRESHNESS: 'edge_freshness',
  // a counter/backlog that must be drained to (<=) a threshold
  BACKLOG_DRAINED: 'backlog_drained',
  // a witnessed cadence: the loop's own periodic_process_registry witness fired recently
  WITNESS_RECENT: 'witness_recent',
});

/**
 * Evaluate a single loop's closure status.
 *
 * @param {Object} loop - a loop_registry row (predicate_type, closure_predicate)
 * @param {Object} evidence - observed evidence for this loop:
 *   { upstreamFiredAt?: ISO|null, edgeAt?: ISO|null, backlogCount?: number, witnessAt?: ISO|null }
 * @param {Date} [now]
 * @returns {{status: string, reason: string}}
 */
export function evaluateLoopClosure(loop, evidence = {}, now = new Date()) {
  const predicate = loop?.closure_predicate || {};
  const type = loop?.predicate_type;
  const nowMs = now.getTime();
  const windowMs = Number(predicate.window_seconds) > 0 ? Number(predicate.window_seconds) * 1000 : null;

  const fresh = (iso) => {
    if (iso == null) return false;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return false;
    return windowMs == null ? true : nowMs - t <= windowMs;
  };
  const upstreamFired = evidence.upstreamFiredAt != null && !Number.isNaN(Date.parse(String(evidence.upstreamFiredAt)));

  switch (type) {
    case PREDICATE_TYPES.EDGE_FRESHNESS: {
      if (fresh(evidence.edgeAt)) return { status: LOOP_STATUS.CLOSED, reason: `closure edge fresh at ${evidence.edgeAt}` };
      if (!upstreamFired) return { status: LOOP_STATUS.STARVED, reason: 'upstream never fired — nothing to close' };
      return { status: LOOP_STATUS.OPEN, reason: evidence.edgeAt ? `closure edge stale (${evidence.edgeAt})` : 'fired but closure edge absent' };
    }
    case PREDICATE_TYPES.BACKLOG_DRAINED: {
      const threshold = Number.isFinite(Number(predicate.threshold)) ? Number(predicate.threshold) : 0;
      const count = Number(evidence.backlogCount);
      if (!Number.isFinite(count)) return { status: LOOP_STATUS.UNKNOWN, reason: 'backlog count unavailable' };
      if (count <= threshold) return { status: LOOP_STATUS.CLOSED, reason: `backlog ${count} <= ${threshold}` };
      if (!upstreamFired) return { status: LOOP_STATUS.STARVED, reason: `backlog ${count} but upstream never fired` };
      return { status: LOOP_STATUS.OPEN, reason: `backlog ${count} > ${threshold} (not drained)` };
    }
    case PREDICATE_TYPES.WITNESS_RECENT: {
      if (fresh(evidence.witnessAt)) return { status: LOOP_STATUS.CLOSED, reason: `witness fresh at ${evidence.witnessAt}` };
      if (!upstreamFired && evidence.witnessAt == null) return { status: LOOP_STATUS.STARVED, reason: 'no witness and upstream never fired' };
      return { status: LOOP_STATUS.OPEN, reason: evidence.witnessAt ? `witness stale (${evidence.witnessAt})` : 'no witness' };
    }
    default:
      return { status: LOOP_STATUS.UNKNOWN, reason: `unknown predicate_type: ${type}` };
  }
}

/**
 * Validate that a loop carries a machine-checkable closure predicate (FR-4: D8
 * enforces this at registration — no loop enrolls without a probe). Returns the
 * reasons a predicate is NOT machine-checkable (empty array => valid).
 *
 * Two rules every predicate MUST satisfy (Solomon Mode-C commission ITEM 2,
 * chairman-ratified 2026-07-16, QF-20260716-579):
 *   (a) FRESHNESS WINDOW DECAY — edge_freshness/witness_recent already re-evaluate
 *       staleness against `now` on every call (see `fresh()` above), so a CLOSED
 *       verdict can never persist past its window on a later tick; this is a
 *       structural property of the stateless evaluator, not something to re-check
 *       here. backlog_drained has no evidence timestamp to go stale (it queries a
 *       live count each tick), so a window requirement does not apply to it.
 *   (b) EVIDENCE PROVENANCE — the predicate must DECLARE which process/role is
 *       authorized to write the evidence rows it trusts (maker/checker separation
 *       at the data layer — a maker can never author its own closure evidence).
 *       Enforced here at registration time; ITEM 3 (verifier read-only role)
 *       enforces the complementary storage-layer half.
 *
 * @param {Object} loop
 * @returns {{valid: boolean, reasons: string[]}}
 */
export function validateClosurePredicate(loop) {
  const reasons = [];
  const type = loop?.predicate_type;
  const predicate = loop?.closure_predicate;
  if (!type || !Object.values(PREDICATE_TYPES).includes(type)) {
    reasons.push(`predicate_type missing or unknown (got: ${type ?? 'null'})`);
  }
  if (predicate == null || typeof predicate !== 'object' || Array.isArray(predicate)) {
    reasons.push('closure_predicate missing or not an object');
  } else {
    if (type === PREDICATE_TYPES.EDGE_FRESHNESS && !(Number(predicate.window_seconds) > 0)) {
      reasons.push('edge_freshness requires a positive window_seconds');
    }
    if (type === PREDICATE_TYPES.BACKLOG_DRAINED && predicate.threshold == null) {
      reasons.push('backlog_drained requires a threshold');
    }
    if (type === PREDICATE_TYPES.WITNESS_RECENT && !(Number(predicate.window_seconds) > 0)) {
      reasons.push('witness_recent requires a positive window_seconds');
    }
    if (!(typeof predicate.authorized_writer === 'string' && predicate.authorized_writer.trim().length > 0)) {
      reasons.push('closure_predicate missing authorized_writer (evidence provenance — a maker cannot author its own closure evidence)');
    }
  }
  return { valid: reasons.length === 0, reasons };
}

/**
 * Distance-to-V1: given the loops for a rung, count closed vs open/starved.
 * @param {Array<{status:string}>} loops
 * @returns {{total:number, closed:number, open:number, starved:number, unknown:number, distance:number}}
 */
export function distanceToRung(loops = []) {
  const tally = { total: loops.length, closed: 0, open: 0, starved: 0, unknown: 0 };
  for (const l of loops) {
    const st = l?.status;
    if (st === LOOP_STATUS.CLOSED) tally.closed++;
    else if (st === LOOP_STATUS.OPEN) tally.open++;
    else if (st === LOOP_STATUS.STARVED) tally.starved++;
    else tally.unknown++;
  }
  // distance = loops not yet closed (open + starved + unknown)
  return { ...tally, distance: tally.total - tally.closed };
}
