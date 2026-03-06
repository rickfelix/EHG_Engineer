/**
 * Rubric Scoring Dimensions for Skill Descriptions
 *
 * Scores each skill description against 5 weighted dimensions:
 *   - keyword_coverage (0.25): Domain-specific keywords present
 *   - specificity (0.25): How narrow/targeted the description is
 *   - exclusion_clarity (0.20): Clear about what it does NOT handle
 *   - action_orientation (0.15): Uses actionable verbs/triggers
 *   - conflict_avoidance (0.15): Avoids overlapping with other skills
 *
 * @module scripts/modules/skill-assessment/rubric-dimensions
 */

/**
 * @typedef {Object} DimensionScore
 * @property {string} dimension - Dimension name
 * @property {number} rawScore - Raw score 0-10
 * @property {number} weight - Weight factor
 * @property {number} weightedScore - rawScore * weight
 * @property {string} rationale - Brief explanation
 */

/**
 * @typedef {Object} RubricResult
 * @property {number} totalScore - Weighted total 0-10
 * @property {DimensionScore[]} dimensions - Per-dimension breakdown
 * @property {string} healthStatus - 'excellent' | 'good' | 'needs_work' | 'poor' | 'missing'
 */

const DIMENSIONS = [
  { name: 'keyword_coverage', weight: 0.25 },
  { name: 'specificity', weight: 0.25 },
  { name: 'exclusion_clarity', weight: 0.20 },
  { name: 'action_orientation', weight: 0.15 },
  { name: 'conflict_avoidance', weight: 0.15 },
];

// Domain keywords that indicate a well-described skill
const DOMAIN_KEYWORDS = [
  'create', 'manage', 'analyze', 'validate', 'generate', 'score', 'audit',
  'review', 'deploy', 'configure', 'monitor', 'process', 'route', 'trigger',
  'database', 'API', 'CLI', 'UI', 'migration', 'schema', 'vision', 'architecture',
  'SD', 'PRD', 'OKR', 'EVA', 'LEO', 'governance', 'compliance', 'testing',
  'feedback', 'inbox', 'research', 'strategy', 'mission', 'constitution',
];

// Action verbs that signal clarity of purpose
const ACTION_VERBS = [
  'use', 'invoke', 'trigger', 'run', 'execute', 'call', 'start', 'launch',
  'handle', 'process', 'manage', 'create', 'build', 'generate', 'validate',
  'score', 'audit', 'review', 'analyze', 'deploy', 'configure', 'monitor',
];

// Words that signal exclusion clarity
const EXCLUSION_MARKERS = [
  'not', 'only', 'exclusively', 'specifically', 'do not', 'never',
  'instead', 'rather', 'except', 'unlike', 'without',
];

/**
 * Score keyword coverage: how many domain-relevant keywords appear.
 *
 * @param {string} description
 * @returns {DimensionScore}
 */
function scoreKeywordCoverage(description) {
  const lower = description.toLowerCase();
  const found = DOMAIN_KEYWORDS.filter(kw => lower.includes(kw.toLowerCase()));
  const ratio = Math.min(found.length / 5, 1); // 5+ keywords = max score
  const rawScore = Math.round(ratio * 10);

  return {
    dimension: 'keyword_coverage',
    rawScore,
    weight: 0.25,
    weightedScore: rawScore * 0.25,
    rationale: `${found.length} domain keywords found (${found.slice(0, 5).join(', ')})`,
  };
}

/**
 * Score specificity: how narrow and targeted the description is.
 * Penalizes vague/generic descriptions, rewards specific scope statements.
 *
 * @param {string} description
 * @returns {DimensionScore}
 */
function scoreSpecificity(description) {
  let score = 5; // baseline

  // Longer descriptions tend to be more specific
  if (description.length > 80) score += 1;
  if (description.length > 150) score += 1;

  // Specific patterns increase score
  if (/\b(when|if|for)\b/i.test(description)) score += 1;
  if (/\b(table|file|endpoint|component|module)\b/i.test(description)) score += 1;

  // Vague patterns decrease score
  if (/\b(stuff|things|various|general|misc)\b/i.test(description)) score -= 2;
  if (description.length < 30) score -= 2;

  const rawScore = Math.max(0, Math.min(10, score));
  return {
    dimension: 'specificity',
    rawScore,
    weight: 0.25,
    weightedScore: rawScore * 0.25,
    rationale: `Description length: ${description.length} chars, specificity indicators present`,
  };
}

/**
 * Score exclusion clarity: does the description clarify what it doesn't do?
 *
 * @param {string} description
 * @returns {DimensionScore}
 */
function scoreExclusionClarity(description) {
  const lower = description.toLowerCase();
  const found = EXCLUSION_MARKERS.filter(m => lower.includes(m));
  let score = 4; // baseline — many good descriptions don't need exclusions

  if (found.length >= 1) score += 2;
  if (found.length >= 3) score += 2;

  // Boundary words are also good signals
  if (/\b(scope|boundary|limit|restrict)\b/i.test(description)) score += 2;

  const rawScore = Math.max(0, Math.min(10, score));
  return {
    dimension: 'exclusion_clarity',
    rawScore,
    weight: 0.20,
    weightedScore: rawScore * 0.20,
    rationale: `${found.length} exclusion markers found`,
  };
}

/**
 * Score action orientation: does the description use actionable language?
 *
 * @param {string} description
 * @returns {DimensionScore}
 */
function scoreActionOrientation(description) {
  const lower = description.toLowerCase();
  const found = ACTION_VERBS.filter(v => lower.includes(v));
  const ratio = Math.min(found.length / 3, 1); // 3+ verbs = max score
  const rawScore = Math.round(ratio * 10);

  return {
    dimension: 'action_orientation',
    rawScore,
    weight: 0.15,
    weightedScore: rawScore * 0.15,
    rationale: `${found.length} action verbs found`,
  };
}

/**
 * Score conflict avoidance: is the description unique enough to avoid triggering
 * on other skills' domains?
 *
 * @param {string} description
 * @param {string[]} otherDescriptions - Descriptions of other skills
 * @returns {DimensionScore}
 */
function scoreConflictAvoidance(description, otherDescriptions = []) {
  if (otherDescriptions.length === 0) {
    return {
      dimension: 'conflict_avoidance',
      rawScore: 7,
      weight: 0.15,
      weightedScore: 7 * 0.15,
      rationale: 'No other descriptions to compare against',
    };
  }

  const words = new Set(description.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  let maxOverlap = 0;

  for (const other of otherDescriptions) {
    const otherWords = new Set(other.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const overlap = [...words].filter(w => otherWords.has(w)).length;
    const overlapRatio = overlap / Math.max(words.size, 1);
    if (overlapRatio > maxOverlap) maxOverlap = overlapRatio;
  }

  // High overlap = low score
  const rawScore = Math.round((1 - maxOverlap) * 10);
  return {
    dimension: 'conflict_avoidance',
    rawScore: Math.max(0, Math.min(10, rawScore)),
    weight: 0.15,
    weightedScore: Math.max(0, Math.min(10, rawScore)) * 0.15,
    rationale: `Max word overlap ratio: ${(maxOverlap * 100).toFixed(0)}%`,
  };
}

/**
 * Determine health status from total score.
 *
 * @param {number} score - Total weighted score 0-10
 * @param {boolean} hasDescription
 * @returns {string}
 */
export function healthStatusFromScore(score, hasDescription) {
  if (!hasDescription) return 'missing';
  if (score >= 8) return 'excellent';
  if (score >= 6) return 'good';
  if (score >= 4) return 'needs_work';
  return 'poor';
}

/**
 * Score a skill description against all rubric dimensions.
 *
 * @param {string|null} description - Skill description (null = missing)
 * @param {string[]} [otherDescriptions] - Other skills' descriptions for conflict check
 * @returns {RubricResult}
 */
export function scoreDescription(description, otherDescriptions = []) {
  if (!description) {
    return {
      totalScore: 0,
      dimensions: DIMENSIONS.map(d => ({
        dimension: d.name,
        rawScore: 0,
        weight: d.weight,
        weightedScore: 0,
        rationale: 'No description provided',
      })),
      healthStatus: 'missing',
    };
  }

  const dimensions = [
    scoreKeywordCoverage(description),
    scoreSpecificity(description),
    scoreExclusionClarity(description),
    scoreActionOrientation(description),
    scoreConflictAvoidance(description, otherDescriptions),
  ];

  const totalScore = parseFloat(dimensions.reduce((sum, d) => sum + d.weightedScore, 0).toFixed(2));
  const healthStatus = healthStatusFromScore(totalScore, true);

  return { totalScore, dimensions, healthStatus };
}

export { DIMENSIONS };
