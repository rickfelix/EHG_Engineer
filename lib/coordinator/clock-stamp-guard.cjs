'use strict';
/**
 * Clock-stamp guard for coordinator outbound bodies.
 *
 * PROVENANCE: this coordinator fabricated "clock read <t>" stamps twice on 2026-07-29 — first
 * by +10h36m (closed-loop: each stamp derived from the previous one, so the error diverged
 * without bound and could never self-correct), then again by +93m AFTER explicitly resolving to
 * read the clock on every message. Intention failed twice, so the check belongs in the tool.
 *
 * The phrase "clock read" is a claim about HOW the value was obtained. This compares it against
 * the only authority (Date.now()) and REWRITES rather than refuses — a bad header must never
 * cost a real message.
 *
 * WHY THIS IS A SHARED MODULE AND NOT AN INLINE CHECK: the first version lived inline in
 * scripts/one-off/_coord-send-worker.cjs, which is exactly the "corrected the door you were
 * standing in front of" failure — coordinator-ack-adam.cjs and coordinator-reply.cjs are also
 * coordinator outbound paths and had no guard. A correction that requires the reader to already
 * be in the right file has not landed; put it on the shared surface every caller passes through.
 */

const STAMP_RE = /clock\s+(?:read|READ)\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)Z?/;
const DRIFT_TOLERANCE_MIN = 2;

/**
 * @param {string} body
 * @param {{nowMs?: number, onRewrite?: (info: {claimed: string, truth: string, driftMin: number}) => void}} [opts]
 * @returns {string} the body, with any stale clock stamp rewritten to the real time
 */
function enforceClockStamp(body, { nowMs = Date.now(), onRewrite } = {}) {
  if (typeof body !== 'string' || !body) return body;
  const m = body.match(STAMP_RE);
  if (!m) return body; // no claim made, nothing to check

  const raw = m[1];
  const claimedMs = Date.parse(raw.length <= 16 ? `${raw}:00Z` : `${raw}Z`);
  if (!Number.isFinite(claimedMs)) return body; // unparseable: leave it, fail open

  const driftMin = Math.abs(nowMs - claimedMs) / 60000;
  if (driftMin <= DRIFT_TOLERANCE_MIN) return body;

  const truth = `${new Date(nowMs).toISOString().slice(0, 16)}Z`;
  if (typeof onRewrite === 'function') onRewrite({ claimed: raw, truth, driftMin });
  return body.replace(m[0], `clock read ${truth}`);
}

module.exports = { enforceClockStamp, STAMP_RE, DRIFT_TOLERANCE_MIN };
