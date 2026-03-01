/**
 * JSONB Schema Definitions for sd_phase_handoffs table
 * SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-E
 */

export const SD_PHASE_HANDOFFS_SCHEMAS = {
  metadata: {
    type: 'object',
    required: false,
  },

  validation_details: {
    type: 'object',
    required: false,
    properties: {
      reason: { type: 'string' },
      result: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          success: { type: 'boolean' },
        },
      },
    },
  },
};

/**
 * Register all sd_phase_handoffs schemas with a registry
 * @param {import('../jsonb-schema-registry.js').JsonbSchemaRegistry} registry
 */
export function registerHandoffSchemas(registry) {
  const table = 'sd_phase_handoffs';
  for (const [field, schema] of Object.entries(SD_PHASE_HANDOFFS_SCHEMAS)) {
    registry.register(table, field, schema);
  }
}
