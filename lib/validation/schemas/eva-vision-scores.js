/**
 * JSONB Schema Definitions for eva_vision_scores table
 * SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-E
 */

export const EVA_VISION_SCORES_SCHEMAS = {
  dimension_scores: {
    type: 'object',
    required: true,
    properties: {
      // Dynamic keys (dimension names), each value has:
      // { name: string, score: number, source: string, reasoning: string }
      // Validated structurally — keys are dynamic per scoring type
    },
  },

  rubric_snapshot: {
    type: 'object',
    required: false,
    properties: {
      mode: { type: 'string' },
      sd_key: { type: 'string' },
      summary: { type: 'string' },
      scored_by: { type: 'string' },
      gaps: { type: 'array' },
    },
  },
};

/**
 * Register all eva_vision_scores schemas with a registry
 * @param {import('../jsonb-schema-registry.js').JsonbSchemaRegistry} registry
 */
export function registerVisionScoreSchemas(registry) {
  const table = 'eva_vision_scores';
  for (const [field, schema] of Object.entries(EVA_VISION_SCORES_SCHEMAS)) {
    registry.register(table, field, schema);
  }
}
