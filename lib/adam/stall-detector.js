/**
 * Adam stall-detector — PURE intended-hold vs genuine-stall classifier.
 * SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-B (Child B / FR-2).
 *
 * Distinguishes an INTENDED HOLD (a known next-step is itself progressing — e.g. a
 * dependency SD still in_progress, or a coordinator daemon-reswap in flight) from a
 * genuine STALL (the thing that should move is not moving AND no self-unblock path
 * exists), per the chairman's locked anti-slip scope (adam_stall_alert): alert ONLY on
 * genuine stall, never on every quiet/hold period — noise is the failure mode this
 * guards against. Age/stall-detection ONLY (v1_BUILD) — no rigid ETAs/Gantt.
 *
 * Pure: no DB/network I/O, so it is independently unit-testable without a live client.
 */

/** Ticks of no movement before a node is even considered for stall/hold classification. */
export const DEFAULT_STALE_TICKS = 8;

/**
 * Classify a chairman-parent node's staleness.
 * @param {{ticksSinceMovement?: number, inFlightNextStep?: boolean}} node
 * @param {{staleTicks?: number}} [opts]
 * @returns {'fresh'|'intended_hold'|'genuine_stall'}
 */
export function classifyStaleness(node, { staleTicks = DEFAULT_STALE_TICKS } = {}) {
  const ticks = Number(node && node.ticksSinceMovement) || 0;
  if (ticks < staleTicks) return 'fresh';
  return node && node.inFlightNextStep ? 'intended_hold' : 'genuine_stall';
}

/**
 * @param {{ticksSinceMovement?: number, inFlightNextStep?: boolean}} node
 * @param {{staleTicks?: number}} [opts]
 * @returns {boolean}
 */
export function isGenuineStall(node, opts) {
  return classifyStaleness(node, opts) === 'genuine_stall';
}
