/**
 * PRD rewrite-loop configuration (SD-LEO-INFRA-AUTO-GENERATED-PRD-001, FR-5 + FR-6).
 *
 * Centralizes env-overridable constants for the cloud-LLM user-story rewrite loop.
 * Default values ship the loop OFF; operators flip PRD_REWRITE_LOOP=true after
 * cost telemetry is reviewed (see PRD integration_operationalization.rollout_strategy).
 *
 * All constants are read via getRewriteConfig() so downstream code sees a single
 * immutable snapshot per invocation — avoids mid-generation env drift from flipping
 * thresholds between stories.
 */

const TRUE_STRINGS = new Set(['true', '1', 'yes', 'on']);

function parseBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return TRUE_STRINGS.has(String(value).trim().toLowerCase());
}

function parseInt10(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Acceptance-criteria phrases classified as boilerplate. Presence of any substring
 * (case-insensitive) marks an AC as boilerplate for the AND-gate in FR-5.
 */
export const BOILERPLATE_AC = [
  'accomplish my goals more efficiently',
  'feature is tested and verified',
  'documentation is updated',
  'implementation is verified',
  'all requirements are met',
  'solution is tested',
  'feature works as expected',
];

/**
 * User-benefit phrases classified as generic. Presence of any substring
 * (case-insensitive) in user_benefit marks the benefit as generic for the AND-gate.
 */
export const GENERIC_BENEFITS = [
  'accomplish my goals',
  'work more efficiently',
  'improve productivity',
  'better experience',
  'get things done',
];

/**
 * Read the rewrite-loop config snapshot from env with defaults.
 * Call once per PRD generation; do not memoize across calls so tests can stub env.
 *
 * @returns {{
 *   enabled: boolean,
 *   scoreThreshold: number,
 *   maxRounds: number,
 *   tokenBudgetIn: number,
 *   tokenBudgetOut: number
 * }}
 */
export function getRewriteConfig() {
  return {
    enabled: parseBool(process.env.PRD_REWRITE_LOOP, false),
    scoreThreshold: parseInt10(process.env.PRD_REWRITE_SCORE_THRESHOLD, 50),
    maxRounds: parseInt10(process.env.PRD_REWRITE_MAX_ROUNDS, 2),
    tokenBudgetIn: parseInt10(process.env.PRD_REWRITE_TOKEN_BUDGET_IN, 10000),
    tokenBudgetOut: parseInt10(process.env.PRD_REWRITE_TOKEN_BUDGET_OUT, 5000),
  };
}

/**
 * AND-gate: a story qualifies for rewrite only when it's low-scoring AND
 * emits a boilerplate/generic signal. Prevents rewriting legitimately terse
 * stories that happen to score low (validation-agent mitigation).
 *
 * @param {Object} story - User story with acceptance_criteria[] and user_benefit
 * @param {number} score - Rubric-computed quality score (0-100)
 * @param {{scoreThreshold:number}} config - From getRewriteConfig()
 * @returns {{triggered: boolean, reasons: string[]}}
 */
export function shouldRewriteStory(story, score, config) {
  const reasons = [];
  if (score >= config.scoreThreshold) {
    return { triggered: false, reasons: ['score_above_threshold'] };
  }
  reasons.push(`score_${score}_below_${config.scoreThreshold}`);

  const acs = Array.isArray(story?.acceptance_criteria) ? story.acceptance_criteria : [];
  const acText = acs.map(a => typeof a === 'string' ? a : (a?.criterion || '')).join(' ').toLowerCase();
  const acBoilerplate = BOILERPLATE_AC.some(p => acText.includes(p));
  const benefit = String(story?.user_benefit || '').toLowerCase();
  const benefitGeneric = GENERIC_BENEFITS.some(p => benefit.includes(p));

  if (!acBoilerplate && !benefitGeneric) {
    return { triggered: false, reasons: ['no_boilerplate_signal'] };
  }
  if (acBoilerplate) reasons.push('boilerplate_ac');
  if (benefitGeneric) reasons.push('generic_benefit');
  return { triggered: true, reasons };
}
