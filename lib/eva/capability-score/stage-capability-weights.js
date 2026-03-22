/**
 * Capability Contribution Score — Stage-to-Dimension Weight Configuration
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-E: TR-002
 *
 * Centralized configuration for:
 *   - STAGE_DIMENSION_WEIGHTS: which dimensions each stage contributes to and how much
 *   - DIMENSION_RUBRICS: scoring rubric descriptions for LLM evaluation
 *   - DIMENSION_OVERALL_WEIGHTS: how dimensions combine into overall CCS
 *
 * All weights are validated at import time.
 */

export const DIMENSIONS = [
  'technical_depth',
  'market_validation',
  'financial_rigor',
  'operational_readiness',
  'strategic_alignment',
];

/**
 * Per-stage dimension weights.
 * Key = stage number (1-26), Value = Map of dimension → weight (0.0-1.0).
 * Weights per stage should sum to 1.0.
 * null dimensions are omitted (not measured at that stage).
 *
 * Stage groupings:
 *   1-5:   THE TRUTH (heavy on market validation + strategic alignment)
 *   6-10:  THE ENGINE (financial rigor + operational readiness emerge)
 *   11-12: THE IDENTITY (strategic alignment + market validation)
 *   13-16: THE BLUEPRINT (technical depth + operational readiness)
 *   17-20: THE BUILD (technical depth dominant)
 *   22-26: LAUNCH & LEARN (operational readiness + all dimensions)
 */
export const STAGE_DIMENSION_WEIGHTS = {
  // THE TRUTH
  1:  { technical_depth: 0.10, market_validation: 0.35, financial_rigor: 0.05, operational_readiness: 0.10, strategic_alignment: 0.40 },
  2:  { technical_depth: 0.15, market_validation: 0.30, financial_rigor: 0.10, operational_readiness: 0.10, strategic_alignment: 0.35 },
  3:  { technical_depth: 0.15, market_validation: 0.30, financial_rigor: 0.15, operational_readiness: 0.10, strategic_alignment: 0.30 },
  4:  { technical_depth: 0.20, market_validation: 0.25, financial_rigor: 0.15, operational_readiness: 0.15, strategic_alignment: 0.25 },
  5:  { technical_depth: 0.20, market_validation: 0.25, financial_rigor: 0.20, operational_readiness: 0.15, strategic_alignment: 0.20 },

  // THE ENGINE
  6:  { technical_depth: 0.15, market_validation: 0.20, financial_rigor: 0.30, operational_readiness: 0.15, strategic_alignment: 0.20 },
  7:  { technical_depth: 0.15, market_validation: 0.20, financial_rigor: 0.30, operational_readiness: 0.20, strategic_alignment: 0.15 },
  8:  { technical_depth: 0.20, market_validation: 0.15, financial_rigor: 0.25, operational_readiness: 0.25, strategic_alignment: 0.15 },
  9:  { technical_depth: 0.20, market_validation: 0.15, financial_rigor: 0.25, operational_readiness: 0.25, strategic_alignment: 0.15 },
  10: { technical_depth: 0.25, market_validation: 0.15, financial_rigor: 0.20, operational_readiness: 0.25, strategic_alignment: 0.15 },

  // THE IDENTITY
  11: { technical_depth: 0.10, market_validation: 0.30, financial_rigor: 0.10, operational_readiness: 0.15, strategic_alignment: 0.35 },
  12: { technical_depth: 0.10, market_validation: 0.30, financial_rigor: 0.10, operational_readiness: 0.15, strategic_alignment: 0.35 },

  // THE BLUEPRINT
  13: { technical_depth: 0.35, market_validation: 0.10, financial_rigor: 0.15, operational_readiness: 0.25, strategic_alignment: 0.15 },
  14: { technical_depth: 0.35, market_validation: 0.10, financial_rigor: 0.15, operational_readiness: 0.25, strategic_alignment: 0.15 },
  15: { technical_depth: 0.30, market_validation: 0.10, financial_rigor: 0.20, operational_readiness: 0.25, strategic_alignment: 0.15 },
  16: { technical_depth: 0.30, market_validation: 0.10, financial_rigor: 0.20, operational_readiness: 0.25, strategic_alignment: 0.15 },

  // THE BUILD
  17: { technical_depth: 0.35, market_validation: 0.10, financial_rigor: 0.15, operational_readiness: 0.25, strategic_alignment: 0.15 },
  18: { technical_depth: 0.40, market_validation: 0.05, financial_rigor: 0.15, operational_readiness: 0.30, strategic_alignment: 0.10 },
  19: { technical_depth: 0.40, market_validation: 0.05, financial_rigor: 0.15, operational_readiness: 0.30, strategic_alignment: 0.10 },
  20: { technical_depth: 0.35, market_validation: 0.10, financial_rigor: 0.15, operational_readiness: 0.25, strategic_alignment: 0.15 },

  // LAUNCH & LEARN
  21: { technical_depth: 0.20, market_validation: 0.20, financial_rigor: 0.20, operational_readiness: 0.25, strategic_alignment: 0.15 },
  22: { technical_depth: 0.20, market_validation: 0.20, financial_rigor: 0.20, operational_readiness: 0.25, strategic_alignment: 0.15 },
  23: { technical_depth: 0.15, market_validation: 0.25, financial_rigor: 0.20, operational_readiness: 0.20, strategic_alignment: 0.20 },
  24: { technical_depth: 0.15, market_validation: 0.25, financial_rigor: 0.20, operational_readiness: 0.20, strategic_alignment: 0.20 },
  25: { technical_depth: 0.20, market_validation: 0.20, financial_rigor: 0.20, operational_readiness: 0.20, strategic_alignment: 0.20 },
};

/**
 * Dimension rubrics for LLM scoring.
 * These are included in the scoring prompt so the LLM knows what to evaluate.
 */
export const DIMENSION_RUBRICS = {
  technical_depth:
    'Evaluate the technical sophistication, architecture quality, and engineering rigor demonstrated in this stage output. Consider: solution complexity vs simplicity, technology choices, scalability considerations, technical feasibility, and innovation level. Score 0 = no technical substance, 100 = exceptional technical depth.',

  market_validation:
    'Evaluate the strength of market evidence, customer understanding, and demand validation in this stage output. Consider: target market clarity, user pain point identification, competitive positioning, evidence of market demand, and go-to-market feasibility. Score 0 = no market evidence, 100 = compelling market validation.',

  financial_rigor:
    'Evaluate the financial analysis quality, unit economics clarity, and business model viability in this stage output. Consider: revenue model clarity, cost structure understanding, pricing strategy, financial projections realism, and path to profitability. Score 0 = no financial analysis, 100 = rigorous financial modeling.',

  operational_readiness:
    'Evaluate the operational preparedness, execution capability, and implementation feasibility in this stage output. Consider: team capability signals, resource planning, timeline realism, risk mitigation strategies, and operational infrastructure. Score 0 = no operational planning, 100 = fully operational-ready.',

  strategic_alignment:
    'Evaluate how well this stage output aligns with the venture\'s strategic vision, mission coherence, and long-term positioning. Consider: vision clarity, mission alignment, strategic differentiation, ecosystem fit, and long-term defensibility. Score 0 = no strategic coherence, 100 = exceptional strategic alignment.',
};

/**
 * Overall dimension weights for computing a single CCS number.
 * These determine how much each dimension contributes to the cumulative score.
 * Must sum to 1.0.
 */
export const DIMENSION_OVERALL_WEIGHTS = {
  technical_depth: 0.25,
  market_validation: 0.20,
  financial_rigor: 0.20,
  operational_readiness: 0.15,
  strategic_alignment: 0.20,
};

// =============================
// Import-time validation
// =============================

function validateWeights() {
  const errors = [];

  // Validate DIMENSION_OVERALL_WEIGHTS sum to 1.0
  const overallSum = Object.values(DIMENSION_OVERALL_WEIGHTS).reduce((a, b) => a + b, 0);
  if (Math.abs(overallSum - 1.0) > 0.001) {
    errors.push(`DIMENSION_OVERALL_WEIGHTS sum to ${overallSum}, expected 1.0`);
  }

  // Validate each stage's dimension weights sum to 1.0
  for (const [stage, weights] of Object.entries(STAGE_DIMENSION_WEIGHTS)) {
    const stageSum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(stageSum - 1.0) > 0.001) {
      errors.push(`Stage ${stage} weights sum to ${stageSum}, expected 1.0`);
    }
    // Validate all dimensions are present
    for (const dim of DIMENSIONS) {
      if (weights[dim] === undefined) {
        errors.push(`Stage ${stage} missing dimension: ${dim}`);
      }
    }
    // Validate weight range
    for (const [dim, weight] of Object.entries(weights)) {
      if (weight < 0 || weight > 1) {
        errors.push(`Stage ${stage} dimension ${dim} weight ${weight} out of range [0, 1]`);
      }
    }
  }

  // Validate all dimensions have rubrics
  for (const dim of DIMENSIONS) {
    if (!DIMENSION_RUBRICS[dim]) {
      errors.push(`Missing rubric for dimension: ${dim}`);
    }
    if (!DIMENSION_OVERALL_WEIGHTS[dim] && DIMENSION_OVERALL_WEIGHTS[dim] !== 0) {
      errors.push(`Missing overall weight for dimension: ${dim}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Capability weight validation failed:\n  ${errors.join('\n  ')}`);
  }
}

validateWeights();
