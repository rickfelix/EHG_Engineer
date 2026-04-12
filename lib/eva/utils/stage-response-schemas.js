/**
 * Per-stage LLM response schemas for validateLLMResponse.
 *
 * Each schema defines required fields, their types, and constraints.
 * Only required fields are checked — extra fields are always allowed.
 *
 * SD-LLM-CONTRACT-PIPELINE-TEST-ORCH-001-A
 */

/**
 * S0 Forecast schema.
 * Expects revenue_projections, cost_breakdown, and timeline as objects.
 */
export const S0_FORECAST_SCHEMA = {
  revenue_projections: { type: 'object', required: true },
  cost_breakdown: { type: 'object', required: true },
  timeline: { type: 'object', required: true },
};

/**
 * S5 Financial Model schema.
 * Expects metrics array and projections object.
 */
export const S5_FINANCIAL_SCHEMA = {
  metrics: { type: 'array', required: true },
  projections: { type: 'object', required: true },
};

/**
 * S15 Wireframe schema.
 * Expects screens array with min 3 items, each having name and ascii_layout.
 */
export const S15_WIREFRAME_SCHEMA = {
  screens: {
    type: 'array',
    required: true,
    minLength: 3,
    items: {
      name: { required: true },
      ascii_layout: { required: true },
    },
  },
};
