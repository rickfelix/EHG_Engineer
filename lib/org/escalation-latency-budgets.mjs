// FW-3 Child F (SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-G): value-neutral escalation-latency budgets.
// The SSOT bounding how long a framing/escalation may sit before it MUST move. Data-only frozen config
// + pure helpers so the framing self-escalation and chairman-escalation paths carry no hardcoded
// latency literals. Defaults borrow the sourcing-engine SLA shape (lib/sourcing-engine/escalator.js
// DEFAULT_SLA_HOURS: CHAIRMAN_GATED 72h / OUTCOME_GATED 168h) and the chairman-decision-timeout poller
// semantics. This is PLUMBING — it carries no "better"; the apex objective function recurses into the
// spine §3.3 row (FW-3 Child G / -001-H), never here.

/** Per-stage escalation-latency ceilings. Frozen so it is a true single-source-of-truth. */
export const ESCALATION_LATENCY_BUDGETS = Object.freeze({
  framing_floor_attempt: Object.freeze({ hours: 1, note: 'apex floor attempt (Opus@high) before it must emit a residual-depth signal' }),
  self_escalation_to_fable: Object.freeze({ hours: 4, note: 'intra-wake self-escalation to a higher-effort (Fable) pass once residual trips' }),
  chairman_escalation_delivery: Object.freeze({ hours: 72, note: 'a pick-class framing must reach the chairman within this SLA (mirrors sourcing CHAIRMAN_GATED 72h)' }),
  outcome_gated: Object.freeze({ hours: 168, note: 'outcome-gated escalation window (mirrors sourcing OUTCOME_GATED 168h)' }),
});

/**
 * Budget (in hours) for an escalation stage. Returns null for an unknown stage (never throws) —
 * consumers treat null as "no budget configured for this stage".
 * @param {string} stage
 * @returns {number|null}
 */
export function budgetHours(stage) {
  const b = ESCALATION_LATENCY_BUDGETS[stage];
  return b && typeof b.hours === 'number' ? b.hours : null;
}

/**
 * Has `elapsedMs` since the stage began exceeded that stage's latency budget?
 * Unknown stage (no budget) -> false (nothing to breach); non-finite elapsed -> false (fail-open).
 * @param {string} stage
 * @param {number} elapsedMs  milliseconds elapsed since the stage was entered
 * @returns {boolean}
 */
export function isOverBudget(stage, elapsedMs) {
  const hours = budgetHours(stage);
  if (hours === null || !Number.isFinite(elapsedMs)) return false;
  return elapsedMs > hours * 3600 * 1000;
}
