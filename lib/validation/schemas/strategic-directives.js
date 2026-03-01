/**
 * JSONB Schema Definitions for strategic_directives_v2 table
 * SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-E
 */

export const STRATEGIC_DIRECTIVES_SCHEMAS = {
  success_criteria: {
    type: 'array',
    required: true,
    minItems: 1,
    items: {
      // Can be strings or objects with {criterion, status}
      properties: {},
    },
  },

  success_metrics: {
    type: 'array',
    required: true,
    minItems: 1,
    items: {
      properties: {
        metric: { type: 'string', required: true },
        target: { required: true },
      },
    },
  },

  key_principles: {
    type: 'array',
    required: false,
    items: {
      // Can be strings or objects
      properties: {},
    },
  },

  key_changes: {
    type: 'array',
    required: false,
    items: {
      properties: {},
    },
  },

  delivers_capabilities: {
    type: 'array',
    required: false,
    items: {
      properties: {
        capability_type: { type: 'string', required: true },
        capability_key: { type: 'string', required: true },
        name: { type: 'string', required: true },
      },
    },
  },

  risks: {
    type: 'array',
    required: false,
    items: {
      properties: {
        risk: { type: 'string', required: true },
        severity: { type: 'string' },
        mitigation: { type: 'string' },
      },
    },
  },

  dependencies: {
    type: 'array',
    required: false,
    items: {
      properties: {},
    },
  },

  metadata: {
    type: 'object',
    required: false,
  },
};

/**
 * Register all strategic_directives_v2 schemas with a registry
 * @param {import('../jsonb-schema-registry.js').JsonbSchemaRegistry} registry
 */
export function registerStrategicDirectivesSchemas(registry) {
  const table = 'strategic_directives_v2';
  for (const [field, schema] of Object.entries(STRATEGIC_DIRECTIVES_SCHEMAS)) {
    registry.register(table, field, schema);
  }
}
