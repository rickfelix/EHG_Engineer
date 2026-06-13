<<<<<<< HEAD
// @wire-check-exempt: library module imported by scripts/glide-path/policy-engine.js (scoreVenture),
// scripts/glide-path/add-income-dimension.mjs (npm: glide:add-income-dimension), and the unit tests
// (glide-path-replacement-net / glide-path-income-integration). Reachable via the glide-path barrel
// re-export chain, which the wire-check entry-point tracer does not follow.
=======
>>>>>>> origin/main
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
  const rawScore = totalW > 0 ? (ttfd * wT + ev * wE + rte * wR) / totalW : 0;

  // PROFITABILITY GATE (adversarial-review fix, SD-LEO-INFRA-INCOME-OBJECTIVE-FUNCTION-001): a
  // loss-making or break-even venture makes NO net progress toward distance-to-quit, so its income
  // contribution is 0 regardless of how fast it claims a first (gross) dollar. The roadmap's
  // "aggressive first-dollar" bias means a first dollar of PROFIT, not revenue while bleeding money —
  // without this gate, time-to-first-dollar's weight floored a money-loser at 0.5, letting it
  // out-rank a profitable-but-slow venture. escapeVelocity + revenue-to-effort already zero on net<=0;
  // this propagates the loss signal through the whole blend.
  const net = replacementNet(f);
  const score = net <= 0 ? 0 : Math.max(0, Math.min(1, rawScore));

  return {
    score,
    components: {
      replacement_net: net,
      revenue_to_effort: rte,
      time_to_first_dollar: ttfd,
      escape_velocity_contribution: ev,
      viable: net > 0,
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

/** Policy dimension key under which the income-contribution score is consumed by scoreVenture. */
export const INCOME_DIMENSION_KEY = 'income_contribution';

/**
 * Enrich a venture row with its income_contribution score (0..100) so the DATA-DRIVEN Glide Path
 * scoreVenture (scripts/glide-path/policy-engine.js) can consume it as a first-class dimension —
 * NOT a parallel scorer. The income sub-scores derive from MULTIPLE venture fields (replacement-net),
 * which scoreVenture's single-source_field extractor cannot compute, so callers pre-compute it here.
 *
 * Tunable strategy stays as policy CONFIG: weights + revenue-to-effort reference are read from
 * policy.metadata.income_weights / policy.metadata.income_revenue_to_effort_ref (falling back to the
 * roadmap defaults). Returns a NEW object (never mutates input); a venture lacking income data lands
 * at income_contribution=0 (fail-safe — unknown earns no credit, never a phantom high score).
 *
 * @param {object} ventureData
 * @param {object} [policy] active portfolio_allocation_policies row (reads policy.metadata)
 * @returns {object} { ...ventureData, income_contribution: 0..100, income_components: {...} }
 */
export function enrichVentureWithIncome(ventureData = {}, policy = {}) {
  const meta = (policy && policy.metadata) || {};
  const { score, components } = incomeContribution(ventureData || {}, {
    weights: meta.income_weights || DEFAULT_INCOME_WEIGHTS,
    revenueToEffortRef: meta.income_revenue_to_effort_ref,
  });
  return {
    ...(ventureData || {}),
    [INCOME_DIMENSION_KEY]: Math.round(score * 100), // 0..100 to match the policy dimension min/max
    income_components: components,
  };
}
