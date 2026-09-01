/**
 * Consecutive-identical-abort escalation tracking for the scheduled safe-root-resync job
 * (SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-A, FR-5).
 *
 * The scheduled fetch+ff-merge job runs as a fresh process each tick (session-armed loop or
 * cron-style dispatch), so nothing may live in module memory — state is passed in and out
 * explicitly, mirroring lib/git/index-jam-detector.js's own state-in/state-out shape, and is
 * persisted by the caller into periodic_process_registry.liveness_source_ref.escalation_state
 * so it survives across process restarts.
 *
 * A single abort is routine (a transient dirty tree, a fetch hiccup, an occasional non-ff
 * conflict) and must not page anyone. Escalation exists for the case a routine abort ISN'T
 * routine: the SAME reason firing on two consecutive ticks in a row.
 */

const emptyState = () => ({ lastAbortReason: null, consecutiveCount: 0 });

/**
 * Sanitize carry-over state the same defensive way index-jam-detector.js does: a corrupt or
 * malformed state must degrade to "start counting again", never silently disable escalation.
 */
export function sanitizeEscalationState(state) {
  if (!state || typeof state !== 'object') return emptyState();
  const reason = typeof state.lastAbortReason === 'string' ? state.lastAbortReason : null;
  const count = Number.isFinite(state.consecutiveCount) && state.consecutiveCount >= 0
    ? Math.trunc(state.consecutiveCount)
    : 0;
  // A count without a reason (or vice versa) is not a state this module ever produces itself —
  // treat it as corrupt and reset, same "degrade to zero" posture as an unusable prior in the
  // detector's own sanitizeState().
  if (reason === null || count === 0) return emptyState();
  return { lastAbortReason: reason, consecutiveCount: count };
}

/**
 * Pure state transition. `abortReason` is null for a run that did NOT abort (success, or a
 * benign no-op skip like "already current") — any non-null string is a distinct abort class.
 *
 * @param {{lastAbortReason: string|null, consecutiveCount: number}} priorState
 * @param {string|null} abortReason
 * @returns {{nextState: {lastAbortReason: string|null, consecutiveCount: number}, escalated: boolean}}
 */
export function trackAbortEscalation(priorState, abortReason) {
  const prior = sanitizeEscalationState(priorState);

  if (!abortReason) {
    return { nextState: emptyState(), escalated: false };
  }

  const sameReasonAsLastTime = prior.lastAbortReason === abortReason;
  const consecutiveCount = sameReasonAsLastTime ? prior.consecutiveCount + 1 : 1;
  const nextState = { lastAbortReason: abortReason, consecutiveCount };

  // Escalate starting on the SECOND consecutive identical abort, not the first — a lone abort
  // is expected operational noise (FR-5 AC-2); only a repeat of the SAME reason is a signal.
  return { nextState, escalated: consecutiveCount >= 2 };
}
