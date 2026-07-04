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
 *
 * SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 FR-1: delegates the role-agnostic scoring
 * mechanics to lib/governance/role-self-score.cjs via ADAM_CONFIG. Adam-specific
 * pieces (dimensions, scorers, action hints, target) stay here.
 */

const core = require('../governance/role-self-score.cjs');

const DEFAULT_EVERY_TURNS = core.DEFAULT_EVERY_TURNS;
const BELOW_THRESHOLD_AT = core.DEFAULT_BELOW_THRESHOLD_AT; // matches lib/fleet/verify-score-contract.mjs DEFAULT_BELOW_THRESHOLD_AT
const TARGET = core.DEFAULT_TARGET; // aspirational per-dimension target (stored as `threshold`, like the existing rows)

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

const ADAM_CONFIG = {
  role: 'adam',
  dimensions: DIMENSIONS,
  scorers: SCORERS,
  actionHints: ACTION_HINTS,
  target: TARGET,
  belowThresholdAt: BELOW_THRESHOLD_AT,
  generatedBy: 'adam-self-assessment-writer',
};

function shouldFire(state, currentTurn, everyTurns = DEFAULT_EVERY_TURNS) {
  return core.shouldFire(state, currentTurn, everyTurns);
}

function freshState() {
  return core.freshState();
}

/**
 * Score all 8 dimensions from a signals object.
 * @returns {{ dimensions: Object<string,number>, provenance: Object, inconclusive: string[] }}
 */
function scoreDimensions(signals) {
  return core.scoreDimensions(signals, ADAM_CONFIG);
}

function classifyBelowThreshold(dimensions, belowAt = BELOW_THRESHOLD_AT) {
  return core.classifyBelowThreshold(dimensions, belowAt);
}

function derivePriorOutcomes(priorScore, currentDimensions) {
  return core.derivePriorOutcomes(priorScore, currentDimensions);
}

function generateCommittedActions(belowThreshold, provenance = {}) {
  return core.generateCommittedActions(belowThreshold, provenance, ACTION_HINTS);
}

function overallString(dimensions) {
  return core.overallString(dimensions);
}

function assembleScore({ dimensions, cycle, session, committedActions, priorOutcomes, provenance, belowThreshold, date }) {
  return core.assembleScore({ dimensions, cycle, session, committedActions, priorOutcomes, provenance, belowThreshold, date, config: ADAM_CONFIG });
}

function buildFeedbackInsertRow(args) {
  return core.buildFeedbackInsertRow(args);
}

module.exports = {
  DIMENSIONS,
  DEFAULT_EVERY_TURNS,
  BELOW_THRESHOLD_AT,
  TARGET,
  ACTION_HINTS,
  SCORERS,
  ADAM_CONFIG,
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
