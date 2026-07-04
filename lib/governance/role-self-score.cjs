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

/** "sum/max (avg/5)" over the numeric dimensions only. */
function overallString(dimensions) {
  const vals = Object.values(dimensions || {}).filter((v) => typeof v === 'number');
  const sum = vals.reduce((a, b) => a + b, 0);
  const avg = vals.length ? sum / vals.length : 0;
  return `${sum}/${vals.length * 5} (${avg.toFixed(1)}/5)`;
}

/**
 * Assemble the canonical score object (the metadata.score payload).
 * @param {Object} args
 * @param {{role: string, target?: number, belowThresholdAt?: number, generatedBy: string}} args.config
 */
function assembleScore({ dimensions, cycle, session, committedActions, priorOutcomes, provenance, belowThreshold, date, config }) {
  return {
    cycle,
    session,
    threshold: config.target ?? DEFAULT_TARGET,
    overall: overallString(dimensions),
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
  assembleScore,
  buildFeedbackInsertRow,
};
