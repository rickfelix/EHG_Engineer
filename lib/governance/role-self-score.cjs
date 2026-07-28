/**
 * Role-agnostic self-assessment core — extracted from lib/adam/self-assessment.cjs.
 * SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 FR-1. NO DB/FS I/O (each role's CLI writer does that).
 *
 * Any role (Adam, coordinator, Solomon, ...) scores itself on its own documented dimensions from
 * OBSERVABLE SIGNALS only, via a RoleConfig: { role, dimensions, scorers, actionHints, target,
 * belowThresholdAt, generatedBy }. A dimension with no signal is INCONCLUSIVE (omitted from the
 * numeric `dimensions` map) — never a fabricated number. The assembled score object matches the
 * schema lib/fleet/verify-score-contract.mjs already consumes: { overall, session, cycle,
 * threshold, dimensions, below_threshold, committed_actions, prior_action_outcomes, review_key,
 * provenance, generated_by }.
 */

const DEFAULT_EVERY_TURNS = 10;
const DEFAULT_BELOW_THRESHOLD_AT = 2; // matches lib/fleet/verify-score-contract.mjs DEFAULT_BELOW_THRESHOLD_AT
const DEFAULT_TARGET = 4; // aspirational per-dimension target (stored as `threshold`)

// ---------------------------------------------------------------------------
// Turn-counter (role-agnostic)
// ---------------------------------------------------------------------------

/** Fire only when at least `everyTurns` turns have elapsed since the last fire. */
function shouldFire(state, currentTurn, everyTurns = DEFAULT_EVERY_TURNS) {
  const last = state && Number.isFinite(state.last_fired_turn) ? state.last_fired_turn : -Infinity;
  return currentTurn - last >= everyTurns;
}

/** Default fresh state (a missing/corrupt state file degrades to this, never a crash). */
function freshState() {
  return { invocations: 0, last_fired_turn: -Infinity, cycle: 0, streak: 0 };
}

// ---------------------------------------------------------------------------
// Dimension scoring (config-driven)
// ---------------------------------------------------------------------------

/**
 * Score all of a role's configured dimensions from a signals object.
 * @param {Object} signals
 * @param {{dimensions: string[], scorers: Object<string,Function>}} config
 * @returns {{ dimensions: Object<string,number>, provenance: Object, inconclusive: string[] }}
 */
function scoreDimensions(signals, config) {
  const s = signals || {};
  const dimensions = {};
  const provenance = {};
  const inconclusive = [];
  for (const dim of config.dimensions) {
    const scorer = config.scorers[dim];
    const r = scorer(s);
    provenance[dim] = { signal: r.signal || null, basis: r.provenance, ...(r.red_flag ? { red_flag: true } : {}) };
    if (typeof r.score === 'number') dimensions[dim] = r.score;
    else inconclusive.push(dim);
  }
  return { dimensions, provenance, inconclusive };
}

/** Below-threshold = numeric dimension scoring at/below the cutoff (default 2). */
function classifyBelowThreshold(dimensions, belowAt = DEFAULT_BELOW_THRESHOLD_AT) {
  return Object.entries(dimensions || {})
    .filter(([, v]) => typeof v === 'number' && v <= belowAt)
    .map(([k]) => k);
}

/**
 * Verify the prior cycle's committed_actions: a dimension "moved" when its current
 * score exceeds the prior score. Populates prior_action_outcomes (required by the
 * contract's Rule 2 whenever the prior cycle committed actions).
 */
function derivePriorOutcomes(priorScore, currentDimensions) {
  if (!priorScore || !Array.isArray(priorScore.committed_actions)) return [];
  const cur = currentDimensions || {};
  const priorDims = priorScore.dimensions || {};
  return priorScore.committed_actions.map((ca) => {
    const dim = ca.gap;
    const priorV = priorDims[dim];
    const curV = cur[dim];
    const moved = typeof priorV === 'number' && typeof curV === 'number' ? curV > priorV : false;
    const outcome = typeof curV !== 'number' ? 'INCONCLUSIVE' : moved ? 'LANDED' : 'NOT_MOVED';
    return { action: ca.action, gap: dim, outcome, moved };
  });
}

/** Generate one committed_action per below-threshold dimension (Rule 1), using the role's action hints. */
function generateCommittedActions(belowThreshold, provenance = {}, actionHints = {}) {
  return (belowThreshold || []).map((dim) => ({
    gap: dim,
    type: 'behavior',
    action: `Improve ${dim}: ${actionHints[dim] || 'address the below-threshold signal'} (${provenance[dim]?.signal || 'signal'}).`,
    verify_next: `Next cycle ${dim} score should exceed this cycle.`,
  }));
}

/**
 * Coverage of a score: how many of the role's dimensions actually carried a signal.
 *
 * SD-LEO-INFRA-ROLE-SESSION-SELF-001 FR-1. `total` is read from the ROLE CONFIG, never derived
 * from the payload — counting the keys of the object we just built would compare a value to
 * itself and could not fail, which is the defect class this whole SD is about.
 *
 * @returns {{scored:number, total:number, unmeasured:string[]}}
 */
function computeCoverage(dimensions, config, inconclusive) {
  const total = Array.isArray(config && config.dimensions) ? config.dimensions.length : 0;
  const scored = Object.values(dimensions || {}).filter((v) => typeof v === 'number').length;
  return { scored, total, unmeasured: Array.isArray(inconclusive) ? [...inconclusive] : [] };
}

/**
 * "sum/max (avg/5)", plus an explicit coverage tail when the sample is partial.
 *
 * THE AVERAGE STAYS OVER SCORED DIMENSIONS — deliberately, and this is the subtle part. The
 * obvious reading of "carry a denominator" is to divide by TOTAL, but that silently converts
 * "we measured one thing and it was excellent" into a failing grade: Solomon scores exactly one
 * of five dimensions today (the other four are structurally unscoreable), so a total-based
 * headline would render its honest 5/5 (5.0/5) as 5/25 (1.0/5). UNMEASURED IS NOT ZERO.
 *
 * What was actually wrong was that "12/15 (4.0/5)" from a 3-of-8 sample is denominator-SHAPED —
 * it reads in the visual grammar of full coverage — so the fix is to say the coverage out loud
 * rather than to move the divisor. A full-coverage score keeps its clean headline unchanged.
 */
function overallString(dimensions, coverage) {
  const vals = Object.values(dimensions || {}).filter((v) => typeof v === 'number');
  const sum = vals.reduce((a, b) => a + b, 0);
  const avg = vals.length ? sum / vals.length : 0;
  const base = `${sum}/${vals.length * 5} (${avg.toFixed(1)}/5)`;
  if (!coverage || !coverage.total || coverage.scored >= coverage.total) return base;
  return `${base} — ${coverage.scored} of ${coverage.total} dimensions measured`;
}

/**
 * Assemble the canonical score object (the metadata.score payload).
 * @param {Object} args
 * @param {{role: string, target?: number, belowThresholdAt?: number, generatedBy: string}} args.config
 */
function assembleScore({ dimensions, cycle, session, committedActions, priorOutcomes, provenance, belowThreshold, date, config, inconclusive }) {
  // FR-1: coverage is computed from the CONFIG and carried alongside — never merged into
  // `dimensions`. Putting an UNMEASURED marker in there as a number would make
  // verify-score-contract.mjs classifyDimensions read every unmeasured dimension as
  // below-threshold, trip Rule 1 INVALID, and cause ALL THREE writers to refuse to write —
  // turning a transparency fix into a total outage of self-scoring.
  const coverage = computeCoverage(dimensions, config, inconclusive);
  return {
    cycle,
    session,
    threshold: config.target ?? DEFAULT_TARGET,
    overall: overallString(dimensions, coverage),
    coverage,
    dimensions,
    below_threshold: belowThreshold || classifyBelowThreshold(dimensions, config.belowThresholdAt),
    committed_actions: committedActions || [],
    prior_action_outcomes: priorOutcomes || [],
    review_key: `${config.role}:cycle${cycle}:${date}`,
    provenance: provenance || {},
    generated_by: config.generatedBy,
  };
}

/**
 * Build the `feedback` table insert row for a role's self-score cycle. Shared by all three
 * writers (adam-self-assessment-writer.cjs, solomon-self-assessment-writer.cjs,
 * coordinator-self-review.mjs's DUE branch) so the NOT-NULL column shape (type,
 * source_application, source_type, severity, title) lives in ONE place instead of being
 * hand-rolled per writer — a prior hand-rolled insert (missing these columns) silently never
 * succeeded (feedback_type_check / NOT NULL constraint violations), found live-testing this SD.
 * @param {{category:string, score:object, belowThreshold?:string[], sessionId:string, title:string}} args
 */
function buildFeedbackInsertRow({ category, score, belowThreshold, sessionId, title }) {
  return {
    type: 'enhancement',
    source_application: 'EHG_Engineer',
    source_type: 'auto_capture',
    category,
    status: 'new',
    severity: 'low',
    title,
    description: JSON.stringify({ overall: score.overall, below_threshold: belowThreshold || [] }),
    metadata: { score, review_key: score.review_key, sender_session: sessionId },
  };
}

module.exports = {
  DEFAULT_EVERY_TURNS,
  DEFAULT_BELOW_THRESHOLD_AT,
  DEFAULT_TARGET,
  shouldFire,
  freshState,
  scoreDimensions,
  classifyBelowThreshold,
  derivePriorOutcomes,
  generateCommittedActions,
  overallString,
  computeCoverage,
  assembleScore,
  buildFeedbackInsertRow,
};
