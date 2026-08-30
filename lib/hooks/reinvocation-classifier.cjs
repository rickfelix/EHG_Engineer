/**
 * Attribution-aware repeat classifier — QF-20260830-275.
 *
 * The RCA-tiered retry counter (retry-state-manager.cjs) counts repeats of the same
 * signature within a 10-minute window with no notion of WHICH invocation each repeat
 * belongs to. When a seat is re-invoked far sooner than the ScheduleWakeup delay it
 * armed (a known harness over-firing bug), each re-invocation issues the one sensible
 * command again (e.g. a CI poll) — and the counter cannot tell that apart from a
 * genuine same-turn blind-retry loop, so it hard-blocks a working seat.
 *
 * This module is PURE (no I/O): given the gap since the signature's prior occurrence
 * and the delay that was last armed via ScheduleWakeup, it classifies the gap as
 * 'reinvocation_caused' (fired sooner than the arm intended — almost certainly a fresh,
 * externally-triggered invocation, not a within-invocation retry) or 'countable'
 * (either a fast same-turn repeat, or a gap that respected/exceeded the armed delay —
 * both still accumulate toward the hard-block; teeth preserved for genuine stuck loops).
 *
 * MIN_CROSS_TURN_GAP_MS is a floor: a genuine same-turn blind retry loop (the sole
 * class this counter must never stop catching) fires within seconds, not tens of
 * seconds, so a very short gap is never classified reinvocation_caused even if a
 * wake was armed with a tiny delay.
 */
'use strict';

const MIN_CROSS_TURN_GAP_MS = 15 * 1000;

/**
 * @param {{ gapMs:number, armedDelaySeconds?:number|null }} opts
 * @returns {'reinvocation_caused'|'countable'}
 */
function classifyGap({ gapMs, armedDelaySeconds } = {}) {
  if (!Number.isFinite(gapMs) || gapMs < 0) return 'countable'; // unknown shape → fail-closed (still counts)
  if (!Number.isFinite(armedDelaySeconds) || armedDelaySeconds <= 0) return 'countable'; // no arm on record
  if (gapMs < MIN_CROSS_TURN_GAP_MS) return 'countable'; // too fast to be a fresh invocation — same-turn retry
  if (gapMs < armedDelaySeconds * 1000) return 'reinvocation_caused'; // fired sooner than the arm intended
  return 'countable'; // gap respected (or exceeded) the arm — a genuinely spaced-out repeat
}

module.exports = { classifyGap, MIN_CROSS_TURN_GAP_MS };
