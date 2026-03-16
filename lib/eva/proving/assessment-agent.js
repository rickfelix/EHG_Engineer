/**
 * Assessment Agent — Two-pass evaluation engine for proving runs.
 *
 * Structural pass: pattern matching and heuristics across 5 dimensions.
 * Semantic pass: LLM evaluation only for ambiguous structural scores (40-70).
 * Gate-type-dependent dimension weighting with kill gate floor at 60.
 *
 * @module lib/eva/proving/assessment-agent
 */

/**
 * Quality dimensions evaluated for each stage.
 */
export const DIMENSIONS = ['code', 'database', 'service', 'tests', 'artifacts'];

/**
 * Gate-type-dependent dimension weights.
 * Each gate type maps to weights for [code, database, service, tests, artifacts].
 * Weights must sum to 1.0.
 */
export const GATE_WEIGHTS = {
  code:      { code: 0.35, database: 0.10, service: 0.15, tests: 0.25, artifacts: 0.15 },
  schema:    { code: 0.10, database: 0.40, service: 0.15, tests: 0.20, artifacts: 0.15 },
  service:   { code: 0.20, database: 0.15, service: 0.35, tests: 0.20, artifacts: 0.10 },
  test:      { code: 0.15, database: 0.10, service: 0.10, tests: 0.45, artifacts: 0.20 },
  artifact:  { code: 0.15, database: 0.10, service: 0.10, tests: 0.15, artifacts: 0.50 },
  default:   { code: 0.20, database: 0.20, service: 0.20, tests: 0.20, artifacts: 0.20 },
};

const KILL_GATE_FLOOR = 60;
const AMBIGUOUS_LOW = 40;
const AMBIGUOUS_HIGH = 70;

/**
 * Structural evaluation for a single dimension.
 * Uses heuristic checks: presence, completeness, naming conventions, size thresholds.
 *
 * @param {string} dimension - One of DIMENSIONS
 * @param {Object} stageData - Stage content to evaluate
 * @returns {{ score: number, rationale: string }}
 */
export function evaluateStructural(dimension, stageData) {
  if (!stageData || typeof stageData !== 'object') {
    return { score: 0, rationale: `No stage data provided for ${dimension} evaluation` };
  }

  switch (dimension) {
    case 'code': return evaluateCode(stageData);
    case 'database': return evaluateDatabase(stageData);
    case 'service': return evaluateService(stageData);
    case 'tests': return evaluateTests(stageData);
    case 'artifacts': return evaluateArtifacts(stageData);
    default: return { score: 50, rationale: `Unknown dimension: ${dimension}` };
  }
}

function evaluateCode(data) {
  let score = 0;
  const reasons = [];
  if (data.files?.length > 0) { score += 30; reasons.push(`${data.files.length} file(s) present`); }
  if (data.lintPassing !== false) { score += 25; reasons.push('lint passing'); }
  if (data.typeCheckPassing !== false) { score += 25; reasons.push('type checks passing'); }
  if (data.hasEntryPoint) { score += 20; reasons.push('entry point defined'); }
  return { score: Math.min(100, score), rationale: reasons.join('; ') || 'No code indicators found' };
}

function evaluateDatabase(data) {
  let score = 0;
  const reasons = [];
  if (data.migrations?.length > 0) { score += 30; reasons.push(`${data.migrations.length} migration(s)`); }
  if (data.schema) { score += 25; reasons.push('schema defined'); }
  if (data.indexes?.length > 0) { score += 20; reasons.push('indexes defined'); }
  if (data.rls !== undefined) { score += 25; reasons.push('RLS policy considered'); }
  return { score: Math.min(100, score), rationale: reasons.join('; ') || 'No database indicators found' };
}

function evaluateService(data) {
  let score = 0;
  const reasons = [];
  if (data.endpoints?.length > 0) { score += 30; reasons.push(`${data.endpoints.length} endpoint(s)`); }
  if (data.errorHandling) { score += 25; reasons.push('error handling present'); }
  if (data.authentication !== undefined) { score += 25; reasons.push('auth considered'); }
  if (data.documentation) { score += 20; reasons.push('API docs present'); }
  return { score: Math.min(100, score), rationale: reasons.join('; ') || 'No service indicators found' };
}

function evaluateTests(data) {
  let score = 0;
  const reasons = [];
  if (data.testFiles?.length > 0) { score += 30; reasons.push(`${data.testFiles.length} test file(s)`); }
  if (data.coverage >= 80) { score += 30; reasons.push(`${data.coverage}% coverage`); }
  else if (data.coverage >= 50) { score += 15; reasons.push(`${data.coverage}% coverage (below 80%)`); }
  if (data.allPassing !== false) { score += 25; reasons.push('tests passing'); }
  if (data.hasE2E) { score += 15; reasons.push('E2E tests present'); }
  return { score: Math.min(100, score), rationale: reasons.join('; ') || 'No test indicators found' };
}

function evaluateArtifacts(data) {
  let score = 0;
  const reasons = [];
  if (data.prd) { score += 25; reasons.push('PRD present'); }
  if (data.architecture) { score += 25; reasons.push('architecture doc present'); }
  if (data.userStories?.length > 0) { score += 25; reasons.push(`${data.userStories.length} user stories`); }
  if (data.retrospective) { score += 25; reasons.push('retrospective present'); }
  return { score: Math.min(100, score), rationale: reasons.join('; ') || 'No artifacts found' };
}

/**
 * Compute weighted composite score from dimension scores.
 *
 * @param {Record<string, number>} dimensionScores - Scores per dimension (0-100)
 * @param {string} gateType - Gate type for weight selection
 * @returns {{ composite: number, weights: Record<string, number>, weighted: Record<string, number> }}
 */
export function computeComposite(dimensionScores, gateType = 'default') {
  const weights = GATE_WEIGHTS[gateType] || GATE_WEIGHTS.default;
  const weighted = {};
  let composite = 0;

  for (const dim of DIMENSIONS) {
    const score = dimensionScores[dim] ?? 0;
    const weight = weights[dim] ?? 0.2;
    weighted[dim] = Math.round(score * weight * 100) / 100;
    composite += score * weight;
  }

  return { composite: Math.round(composite * 100) / 100, weights, weighted };
}

/**
 * Evaluate a stage with two-pass assessment.
 *
 * @param {Object} stageData - Stage content to evaluate
 * @param {Object} options
 * @param {string} [options.gateType='default'] - Gate type for weighting
 * @param {Function} [options.semanticEvaluator] - Optional LLM evaluator for semantic pass
 * @returns {Promise<{ dimensions: Record<string, {score: number, rationale: string, pass: string}>, composite: number, decision: string, killGate: boolean }>}
 */
export async function evaluateStage(stageData, options = {}) {
  const { gateType = 'default', semanticEvaluator } = options;

  // Pass 1: Structural evaluation (all dimensions in parallel)
  const dimensionResults = {};
  for (const dim of DIMENSIONS) {
    dimensionResults[dim] = evaluateStructural(dim, stageData);
  }

  // Pass 2: Semantic evaluation for ambiguous scores
  if (semanticEvaluator) {
    for (const dim of DIMENSIONS) {
      const { score } = dimensionResults[dim];
      if (score >= AMBIGUOUS_LOW && score <= AMBIGUOUS_HIGH) {
        try {
          const semanticResult = await semanticEvaluator(dim, stageData);
          if (semanticResult && typeof semanticResult.score === 'number') {
            dimensionResults[dim] = {
              score: semanticResult.score,
              rationale: `[semantic] ${semanticResult.rationale || 'LLM evaluation'}`,
              pass: 'semantic',
            };
          }
        } catch {
          // Semantic pass failure is non-critical — keep structural score
        }
      }
    }
  }

  // Compute composite
  const scores = Object.fromEntries(DIMENSIONS.map(d => [d, dimensionResults[d].score]));
  const { composite, weights, weighted } = computeComposite(scores, gateType);

  // Kill gate check
  const killGate = composite < KILL_GATE_FLOOR;
  const decision = killGate ? 'FAIL' : composite >= 70 ? 'PASS' : 'REVISE';

  // Annotate each dimension with pass type
  const dimensions = {};
  for (const dim of DIMENSIONS) {
    dimensions[dim] = {
      ...dimensionResults[dim],
      pass: dimensionResults[dim].pass || 'structural',
      weight: weights[dim],
    };
  }

  return { dimensions, composite, decision, killGate, gateType, weighted };
}
