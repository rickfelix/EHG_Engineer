/**
 * Synthesis Component 10: Design Evaluation
 *
 * Evaluates the venture's design potential across 5 dimensions:
 * - UX Simplicity: Core user flow clarity, steps to first value
 * - Design Differentiation: Can superior UX be a competitive advantage?
 * - Adoption Friction: How much friction to onboard? (inverted: 10 = frictionless)
 * - Design Scalability: Can the design system scale across platforms/markets?
 * - Aesthetic Moat: Can visual polish create brand loyalty and switching costs?
 *
 * Part of SD-EVA-FEAT-DESIGN-PERSONA-001
 */

import { getValidationClient } from '../../../llm/client-factory.js';
import { extractUsage } from '../../utils/parse-json.js';

const DESIGN_DIMENSIONS = ['ux_simplicity', 'design_differentiation', 'adoption_friction', 'design_scalability', 'aesthetic_moat', 'machine_interface_quality'];

const DESIGN_RECOMMENDATIONS = ['design_led', 'design_standard', 'design_minimal'];

/**
 * Evaluate design potential for a venture candidate.
 *
 * @param {Object} pathOutput - PathOutput from entry path
 * @param {Object} deps - Injected dependencies
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} Design evaluation analysis
 */
export async function evaluateDesignPotential(pathOutput, deps = {}) {
  const { logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();

  logger.log('   Evaluating design potential...');

  const prompt = `You are an EHG product design evaluator. Assess the design potential and UX quality opportunity for this venture.

VENTURE:
Name: ${pathOutput.suggested_name}
Problem: ${pathOutput.suggested_problem}
Solution: ${pathOutput.suggested_solution}
Market: ${pathOutput.target_market}

EHG Chairman Directives:
- Ventures should aim for design excellence where it drives differentiation
- Reduce adoption friction to accelerate growth
- Superior UX creates compounding retention advantages

DESIGN DIMENSIONS (score each 1-10):
1. ux_simplicity: How simple is the core user flow? Steps to first value? (10 = trivially simple)
2. design_differentiation: Can superior UX be a competitive advantage in this market? (10 = design is the moat)
3. adoption_friction: How much friction to onboard new users? (INVERTED: 10 = completely frictionless, 1 = extreme friction)
4. design_scalability: Can the design system scale across platforms, markets, and user segments? (10 = infinitely scalable)
5. aesthetic_moat: Can visual polish and brand design create loyalty and switching costs? (10 = iconic brand potential)
6. machine_interface_quality: API design clarity, structured data completeness, schema.org readiness, and agent-friendly documentation quality (10 = perfectly machine-consumable)

For each dimension, provide a score and brief rationale.

Return JSON:
{
  "dimensions": {
    "ux_simplicity": 8,
    "design_differentiation": 7,
    "adoption_friction": 6,
    "design_scalability": 7,
    "aesthetic_moat": 5,
    "machine_interface_quality": 6
  },
  "composite_score": 66,
  "design_risks": ["string"],
  "design_opportunities": ["string"],
  "recommendation": "design_led|design_standard|design_minimal",
  "summary": "string (2-3 sentences)"
}

composite_score = weighted average of 6 dimensions * 10 (equal weights). Round to integer.
recommendation: design_led (composite >= 70), design_standard (40-69), design_minimal (< 40).`;

  try {
    const response = await client.complete('', prompt, { max_tokens: 1500, timeout: 120000 });
    const usage = extractUsage(response);
    const text = typeof response === 'string' ? response : (response?.content || '');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      const dims = analysis.dimensions || {};
      const composite = typeof analysis.composite_score === 'number'
        ? Math.round(analysis.composite_score)
        : computeComposite(dims);
      const rec = DESIGN_RECOMMENDATIONS.includes(analysis.recommendation)
        ? analysis.recommendation
        : inferRecommendation(composite);

      return {
        component: 'design_evaluation',
        dimensions: {
          ux_simplicity: clampDimension(dims.ux_simplicity),
          design_differentiation: clampDimension(dims.design_differentiation),
          adoption_friction: clampDimension(dims.adoption_friction),
          design_scalability: clampDimension(dims.design_scalability),
          aesthetic_moat: clampDimension(dims.aesthetic_moat),
          machine_interface_quality: clampDimension(dims.machine_interface_quality),
        },
        composite_score: Math.max(0, Math.min(100, composite)),
        design_risks: Array.isArray(analysis.design_risks) ? analysis.design_risks : [],
        design_opportunities: Array.isArray(analysis.design_opportunities) ? analysis.design_opportunities : [],
        recommendation: rec,
        summary: analysis.summary || '',
        usage,
      };
    }
    return defaultDesignResult('Could not parse design evaluation');
  } catch (err) {
    logger.warn(`   Warning: Design evaluation failed: ${err.message}`);
    return defaultDesignResult(`Evaluation failed: ${err.message}`);
  }
}

function clampDimension(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n)));
}

function computeComposite(dims) {
  const values = DESIGN_DIMENSIONS.map(d => clampDimension(dims[d]));
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / DESIGN_DIMENSIONS.length) * 10);
}

function inferRecommendation(composite) {
  if (composite >= 70) return 'design_led';
  if (composite >= 40) return 'design_standard';
  return 'design_minimal';
}

function defaultDesignResult(summary) {
  return {
    component: 'design_evaluation',
    dimensions: {
      ux_simplicity: 0,
      design_differentiation: 0,
      adoption_friction: 0,
      design_scalability: 0,
      aesthetic_moat: 0,
      machine_interface_quality: 0,
    },
    composite_score: 0,
    design_risks: [],
    design_opportunities: [],
    recommendation: 'design_minimal',
    summary,
  };
}

export { DESIGN_DIMENSIONS, DESIGN_RECOMMENDATIONS };
