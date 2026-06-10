/**
 * Adam self-assessment — pure, dependency-injected core.
 * SD-LEO-INFRA-ADAM-SELF-ASSESSMENT-001. NO DB/FS I/O (the CLI does that).
 *
 * Scores Adam on the canonical 8 dimensions (leo_protocol_sections id=601) from
 * OBSERVABLE SIGNALS only. A dimension with no signal is emitted as INCONCLUSIVE
 * (omitted from the numeric `dimensions` map / null) — never a fabricated number.
 * The score object matches the schema the verify-score-contract + adam-exec-summary
 * already consume: { overall, session, cycle, threshold, dimensions, below_threshold,
 * committed_actions, prior_action_outcomes, review_key }.
 */

const DEFAULT_EVERY_TURNS = 10;
const BELOW_THRESHOLD_AT = 2; // matches lib/fleet/verify-score-contract.mjs DEFAULT_BELOW_THRESHOLD_AT
const TARGET = 4; // aspirational per-dimension target (stored as `threshold`, like the existing rows)

const DIMENSIONS = [
  'D1_proactive_sourcing',
  'D2_propose_first',
  'D3_reviewer_not_safetynet',
  'D4_verify_before_certainty',
  'D5_vision_alignment',
  'D6_close_loops_ack',
  'D7_sd_quality',
  'D8_interface_clarity',
];

const ACTION_HINTS = {
  D1_proactive_sourcing: 'source more belt candidates and dedup before idling',
  D2_propose_first: 'never claim or build — surface options and decline build-routes',
  D3_reviewer_not_safetynet: 'let the coordinator run without intervening; catch by decline',
  D4_verify_before_certainty: 'verify every claim against live code/DB before asserting',
  D5_vision_alignment: 'cite a live objective/KR row (or L2 vision + metric) in every advisory',
  D6_close_loops_ack: 'post terminal-action check-ins and ack directives within SLA',
  D7_sd_quality: 'ground SD drafts in file:line, right tier, dedup-cited',
  D8_interface_clarity: 'clear advisories, correct lane/target, <=1 per tick',
};

// ---------------------------------------------------------------------------
// Turn-counter
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
// Dimension scorers (observable signal -> 1..5, or null = inconclusive)
// ---------------------------------------------------------------------------

const SCORERS = {
  // belt depth: more unclaimed workable SDs surfaced/available = better proactive sourcing
  D1_proactive_sourcing: (s) => {
    if (s.belt_depth == null) return { score: null, provenance: 'no belt_depth signal (inconclusive)' };
    const d = s.belt_depth;
    const score = d >= 8 ? 5 : d >= 5 ? 4 : d >= 3 ? 3 : d >= 1 ? 2 : 1;
    return { score, signal: `belt_depth=${d}`, provenance: 'unclaimed workable SD count' };
  },
  // Adam must NEVER claim/build — 0 claims is the only passing state; any claim is a red-flag.
  D2_propose_first: (s) => {
    if (s.adam_claim_count == null) return { score: null, provenance: 'no adam_claim_count signal (inconclusive)' };
    const n = s.adam_claim_count;
    return {
      score: n === 0 ? 5 : 1,
      signal: `adam_claim_count=${n}`,
      provenance: 'claude_sessions Adam-role rows with a non-null sd_key',
      red_flag: n > 0,
    };
  },
  // coordinator can run without Adam — hard to measure directly; inconclusive unless supplied
  D3_reviewer_not_safetynet: (s) => {
    if (s.coordinator_autonomy_rate == null) return { score: null, provenance: 'no coordinator_autonomy signal (inconclusive)' };
    const r = s.coordinator_autonomy_rate;
    const score = r >= 0.95 ? 5 : r >= 0.8 ? 4 : r >= 0.6 ? 3 : r >= 0.4 ? 2 : 1;
    return { score, signal: `coordinator_autonomy_rate=${r}`, provenance: 'coordinator review cycles run without Adam intervention' };
  },
  // verify-before-certainty: fewer contradicted/false claims = better
  D4_verify_before_certainty: (s) => {
    if (s.false_claim_rate == null) return { score: null, provenance: 'no false_claim_rate signal (inconclusive)' };
    const r = s.false_claim_rate;
    const score = r <= 0.02 ? 5 : r <= 0.05 ? 4 : r <= 0.1 ? 3 : r <= 0.2 ? 2 : 1;
    return { score, signal: `false_claim_rate=${r}`, provenance: 'dropped-on-verify / live-contradicted claims' };
  },
  // vision alignment: share of advisories citing a live objective/KR/vision row
  D5_vision_alignment: (s) => {
    if (s.advisory_citation_rate == null) return { score: null, provenance: 'no advisory_citation_rate signal (inconclusive)' };
    const r = s.advisory_citation_rate;
    const score = r >= 0.95 ? 5 : r >= 0.8 ? 4 : r >= 0.6 ? 3 : r >= 0.3 ? 2 : 1;
    return { score, signal: `advisory_citation_rate=${r}`, provenance: 'advisories citing objectives/key_results/eva_vision_documents' };
  },
  // close loops: lower ack latency (minutes) on Adam-targeted coordination rows = better
  D6_close_loops_ack: (s) => {
    if (s.ack_latency_min == null) return { score: null, provenance: 'no ack_latency_min signal (inconclusive)' };
    const m = s.ack_latency_min;
    const score = m <= 15 ? 5 : m <= 60 ? 4 : m <= 240 ? 3 : m <= 1440 ? 2 : 1;
    return { score, signal: `ack_latency_min=${m}`, provenance: 'session_coordination read_at/actioned_at median latency' };
  },
  // sd quality: gate pass-rate of Adam-authored draft SDs
  D7_sd_quality: (s) => {
    if (s.adam_sd_pass_rate == null) return { score: null, provenance: 'no adam_sd_pass_rate signal (inconclusive)' };
    const r = s.adam_sd_pass_rate;
    const score = r >= 0.95 ? 5 : r >= 0.85 ? 4 : r >= 0.7 ? 3 : r >= 0.5 ? 2 : 1;
    return { score, signal: `adam_sd_pass_rate=${r}`, provenance: 'gate pass-rate of Adam-authored SD drafts' };
  },
  // interface clarity: advisory deliverability (delivered / total)
  D8_interface_clarity: (s) => {
    if (s.advisory_deliverability == null) return { score: null, provenance: 'no advisory_deliverability signal (inconclusive)' };
    const r = s.advisory_deliverability;
    const score = r >= 0.98 ? 5 : r >= 0.9 ? 4 : r >= 0.75 ? 3 : r >= 0.5 ? 2 : 1;
    return { score, signal: `advisory_deliverability=${r}`, provenance: 'advisories delivered vs dead-lettered' };
  },
};

/**
 * Score all 8 dimensions from a signals object.
 * @returns {{ dimensions: Object<string,number>, provenance: Object, inconclusive: string[] }}
 */
function scoreDimensions(signals) {
  const s = signals || {};
  const dimensions = {};
  const provenance = {};
  const inconclusive = [];
  for (const dim of DIMENSIONS) {
    const r = SCORERS[dim](s);
    provenance[dim] = { signal: r.signal || null, basis: r.provenance, ...(r.red_flag ? { red_flag: true } : {}) };
    if (typeof r.score === 'number') dimensions[dim] = r.score;
    else inconclusive.push(dim);
  }
  return { dimensions, provenance, inconclusive };
}

/** Below-threshold = numeric dimension scoring at/below the cutoff (default 2). */
function classifyBelowThreshold(dimensions, belowAt = BELOW_THRESHOLD_AT) {
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

/** Generate one committed_action per below-threshold dimension (Rule 1). */
function generateCommittedActions(belowThreshold, provenance = {}) {
  return (belowThreshold || []).map((dim) => ({
    gap: dim,
    type: 'behavior',
    action: `Improve ${dim}: ${ACTION_HINTS[dim] || 'address the below-threshold signal'} (${provenance[dim]?.signal || 'signal'}).`,
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

/** Assemble the canonical score object (the metadata.score payload). */
function assembleScore({ dimensions, cycle, session, committedActions, priorOutcomes, provenance, belowThreshold, date }) {
  return {
    cycle,
    session,
    threshold: TARGET,
    overall: overallString(dimensions),
    dimensions,
    below_threshold: belowThreshold || classifyBelowThreshold(dimensions),
    committed_actions: committedActions || [],
    prior_action_outcomes: priorOutcomes || [],
    review_key: `adam:cycle${cycle}:${date}`,
    provenance: provenance || {},
    generated_by: 'adam-self-assessment-writer',
  };
}

module.exports = {
  DIMENSIONS,
  DEFAULT_EVERY_TURNS,
  BELOW_THRESHOLD_AT,
  TARGET,
  ACTION_HINTS,
  SCORERS,
  shouldFire,
  freshState,
  scoreDimensions,
  classifyBelowThreshold,
  derivePriorOutcomes,
  generateCommittedActions,
  overallString,
  assembleScore,
};
