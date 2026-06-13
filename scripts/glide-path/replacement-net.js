/**
 * Replacement-net + income-contribution scoring — SD-LEO-INFRA-INCOME-OBJECTIVE-FUNCTION-001.
 *
 * Makes "distance-to-quit" executable: encodes the chairman's quit-Exelon objective
 * (revenue-to-effort + time-to-first-dollar + contribution-to-$18k/mo escape-velocity) as
 * computable inputs the Glide Path policy weighting (scripts/glide-path/policy-engine.js
 * scoreVenture) consumes as first-class, TUNABLE dimensions — NOT a parallel scorer.
 *
 * Canonical net: replacement-net is the SINGLE definition of "net income that counts toward
 * replacing the day-job salary" used everywhere — revenue MINUS business expenses, PPO
 * (health-insurance premium replacement), retirement contribution, and self-employment tax.
 * Income contribution is then scored against the $18k/mo escape-velocity target.
 *
 * Pure functions, no I/O, fail-safe on missing fields (treat as 0) so a venture with partial
 * financials never throws inside the scorer. Venture SELECTION stays deferred behind the
 * chairman trigger — this module only DEFINES the objective, it does not pick anything.
 */

/** Default monthly net-income target to fully replace the day-job salary (escape velocity). */
export const ESCAPE_VELOCITY_TARGET_MONTHLY = 18000;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Canonical replacement-net (monthly $): the net income that counts toward quitting.
 *   replacement_net = revenue − business_expenses − ppo − retirement − se_tax
 * Every consumer MUST use this — do not re-derive net elsewhere.
 *
 * @param {object} f
 * @param {number} [f.revenue]            gross monthly revenue
 * @param {number} [f.business_expenses]  monthly business operating expenses
 * @param {number} [f.ppo]               monthly health-insurance (PPO) premium replacement
 * @param {number} [f.retirement]        monthly retirement contribution replacement
 * @param {number} [f.se_tax]            monthly self-employment tax
 * @returns {number} replacement-net (may be negative for a loss-making venture)
 */
export function replacementNet(f = {}) {
  return num(f.revenue) - num(f.business_expenses) - num(f.ppo) - num(f.retirement) - num(f.se_tax);
}

/**
 * Revenue-to-effort: replacement-net per unit of effort (effort in person-weeks). Higher is
 * better. effort<=0 → 0 (cannot divide; an effort-free infinite-ROI claim is not trusted).
 * @returns {number} replacement-net dollars per person-week
 */
export function revenueToEffort(f = {}) {
  const effort = num(f.effort_person_weeks);
  if (effort <= 0) return 0;
  return replacementNet(f) / effort;
}

/**
 * Escape-velocity contribution: fraction of the $18k/mo target this venture's replacement-net
 * covers, clamped to [0,1]. A venture already covering the full target scores 1.0.
 * @param {object} f
 * @param {number} [target] override target (defaults to ESCAPE_VELOCITY_TARGET_MONTHLY)
 * @returns {number} 0..1
 */
export function escapeVelocityContribution(f = {}, target = ESCAPE_VELOCITY_TARGET_MONTHLY) {
  const t = num(target);
  if (t <= 0) return 0;
  const net = replacementNet(f);
  if (net <= 0) return 0;
  return Math.max(0, Math.min(1, net / t));
}

/**
 * Time-to-first-dollar score: SOONER is better (the roadmap's "aggressive first-dollar"
 * bias). Maps days-to-first-revenue to a 0..1 score via an exponential decay with a 90-day
 * half-ish horizon, so 0 days → 1.0 and far-out revenue → ~0. days<0/unknown → 0.
 * @param {object} f
 * @param {number} [f.days_to_first_dollar]
 * @returns {number} 0..1 (higher = sooner)
 */
export function timeToFirstDollarScore(f = {}) {
  // UNKNOWN time-to-first-dollar earns NO credit (treated as 0), consistent with how the other
  // factors treat missing financials — an empty venture must not score "instant revenue". Only an
  // EXPLICIT 0 means "already earning". A missing/null/non-numeric field is unknown → 0.
  if (f == null || f.days_to_first_dollar == null || !Number.isFinite(Number(f.days_to_first_dollar))) return 0;
  const days = Number(f.days_to_first_dollar);
  if (days < 0) return 0;
  const HORIZON_DAYS = 90; // ~one quarter; tune via policy if needed
  return Math.max(0, Math.min(1, Math.exp(-days / HORIZON_DAYS)));
}

/**
 * Income-contribution composite (0..1) — a weighted blend of the three first-class factors.
 * Weights default to the roadmap's "aggressive first-dollar" bias (time-to-first-dollar
 * highest) but are TUNABLE: callers (and the Glide Path policy) pass their own weights so the
 * strategy stays config, not hardcoded. revenue-to-effort is normalized against a reference
 * $/person-week so it lands on the same 0..1 scale as the other two.
 *
 * @param {object} f venture financial fields
 * @param {object} [opts]
 * @param {{timeToFirstDollar:number,escapeVelocity:number,revenueToEffort:number}} [opts.weights]
 * @param {number} [opts.revenueToEffortRef] $/person-week that maps to a 1.0 revenue-to-effort sub-score
 * @returns {{score:number, components:object}} composite 0..1 + the sub-scores for transparency
 */
export function incomeContribution(f = {}, opts = {}) {
  const weights = opts.weights || DEFAULT_INCOME_WEIGHTS;
  const ref = num(opts.revenueToEffortRef) || 5000; // $5k replacement-net / person-week → 1.0
  const rte = ref > 0 ? Math.max(0, Math.min(1, revenueToEffort(f) / ref)) : 0;
  const ttfd = timeToFirstDollarScore(f);
  const ev = escapeVelocityContribution(f);

  const wT = num(weights.timeToFirstDollar);
  const wE = num(weights.escapeVelocity);
  const wR = num(weights.revenueToEffort);
  const totalW = wT + wE + wR;
  const score = totalW > 0 ? (ttfd * wT + ev * wE + rte * wR) / totalW : 0;

  return {
    score: Math.max(0, Math.min(1, score)),
    components: {
      replacement_net: replacementNet(f),
      revenue_to_effort: rte,
      time_to_first_dollar: ttfd,
      escape_velocity_contribution: ev,
    },
  };
}

/**
 * Default income-contribution weights — time-to-first-dollar highest, per the roadmap's
 * "aggressive first-dollar" stance. TUNABLE: override via the Glide Path policy / opts so the
 * strategy choice stays config the chairman adjusts, not a hardcoded value.
 */
export const DEFAULT_INCOME_WEIGHTS = Object.freeze({
  timeToFirstDollar: 0.5,
  escapeVelocity: 0.3,
  revenueToEffort: 0.2,
});
