/**
 * SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-C / RCA 9a02a76d — output-flow gauge.
 *
 * scripts/adam-quiet-tick.mjs has 33 named QUIET_TICK_* axes, all input/liveness-oriented
 * (e.g. QUIET_TICK_IDLE_BESIDE_CLAIMABLE measures input availability) -- none measures whether
 * origin/main is actually ADVANCING. During the RCA'd incident the tick read "2 active workers,
 * 1 build" all night while nothing merged for 14.6h: zero throughput was invisible to every
 * existing axis. This module closes that blind spot with one pure detector: has origin/main's
 * HEAD moved in the last thresholdMs, given the fleet is not legitimately quiescent?
 *
 * DELIBERATELY gated on caller-supplied `quiescent` rather than baked in here: a legitimately
 * idle fleet (no active workers) SHOULD show zero throughput -- that is not the incident. The
 * incident shape is "workers active, nothing landing", so the caller (adam-quiet-tick.mjs, which
 * already computes `quiescent` every tick) decides whether to even ask this question.
 */

/** How long origin/main HEAD may sit unchanged, while the fleet is active, before flagging. */
export const OUTPUT_FLOW_STALL_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4h

/**
 * Pure: given the current origin/main HEAD sha and the last-persisted state, decide whether
 * output flow has stalled, and what state to persist for next tick.
 *
 * @param {{headSha: string|null, priorHeadSha?: string|null, priorFirstSeenAt?: number|null,
 *   nowMs?: number, thresholdMs?: number, quiescent?: boolean}} args
 * @returns {{matched: boolean, stalledMs: number, nextState: {headSha: string|null, firstSeenAt: number|null}}}
 */
export function detectOutputFlowStall({
  headSha,
  priorHeadSha = null,
  priorFirstSeenAt = null,
  nowMs = Date.now(),
  thresholdMs = OUTPUT_FLOW_STALL_THRESHOLD_MS,
  quiescent = false,
} = {}) {
  // No usable HEAD reading (git failure, offline) -- never flag on missing data.
  if (!headSha) {
    return { matched: false, stalledMs: 0, nextState: { headSha: priorHeadSha, firstSeenAt: priorFirstSeenAt } };
  }
  // HEAD moved (or this is the first-ever reading) -- reset the baseline, never flag.
  if (headSha !== priorHeadSha || !Number.isFinite(priorFirstSeenAt)) {
    return { matched: false, stalledMs: 0, nextState: { headSha, firstSeenAt: nowMs } };
  }
  const stalledMs = nowMs - priorFirstSeenAt;
  // A legitimately idle fleet is not the incident this gauge exists to catch.
  const matched = !quiescent && stalledMs >= thresholdMs;
  return { matched, stalledMs, nextState: { headSha, firstSeenAt: priorFirstSeenAt } };
}
